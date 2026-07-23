import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/db";
import { seasons, programs, sports, organizations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { brandFromHost, originForBrand } from "@/lib/organization/soccerone-routing";
import { sendInappRecaptureEmail } from "@/lib/email/send";
import { normalizePhone, toE164 } from "@/lib/phone";
import { sendSms } from "@/lib/sms/send";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";
import { env } from "@/lib/env";

const EmailBody = z.object({
  seasonId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
});

const PhoneBody = z.object({
  seasonId: z.string().uuid(),
  phone: z
    .string()
    .trim()
    .transform((v) => normalizePhone(v))
    .refine((v) => v.length === 10, { message: "Invalid phone number" }),
});

const BodySchema = z.union([EmailBody, PhoneBody]);

// The surface that writes `pending` phone_opt_ins rows from this endpoint.
// Distinct from PICKUP_NOTIFY_SOURCE / kiosk_spectator — see PHONE_OPT_IN_SOURCE.
const RECAPTURE_SOURCE = "recapture_request" as const;

// In-app-browser escape banner "email/text yourself a link" disclosure. The
// visitor is stuck in an Instagram/Facebook webview mid-registration and
// wants a plain link to finish on their own device's browser — no account
// or session required, so this is a public, unauthenticated endpoint.
//
// Always responds { sent: true } on valid input, including when dedupe (email
// path) or a swallowed send failure (either path) silently no-op'd — the
// response must never become an oracle for "does this email/phone already
// have an account" or "did we already send to this address/number."
//
// Consent (phone path only): this is a single, user-requested transactional
// text — the visitor typed their own number and asked for the link. That is
// the same legal carve-out phone-otp.ts documents for OTP codes ("bypass
// opt-in check because [this] flow is how we establish opt-in in the first
// place"), so the SMS send passes bypassOptInCheck: true. We still record a
// `pending` phone_opt_ins row via recordPhoneOptIn(consented: false) purely
// for evidence — this endpoint NEVER writes consented: true (opted_in),
// since nobody checked a marketing consent box here. dropin/notify.ts's
// recordMarketingConsent()/resolveMarketingUser() path was considered but
// doesn't transfer: it requires a userId resolved via a canonical EMAIL
// (resolveMarketingUser's only lookup key), and this endpoint's phone branch
// has no email at all — so recordPhoneOptIn (userId-optional, no email
// dependency) is the correct fit here, not an improvisation.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-IP throttle: unauthenticated public endpoint that triggers an email
  // or SMS send, so it's a spam/abuse surface. 5/min/IP matches the other
  // public recapture-adjacent endpoints (season-interest, guest-checkout).
  // One shared bucket for both channels — a caller alternating email/phone
  // bodies must not get 2x the effective budget.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`register-recapture:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = parsed.data;
  const { seasonId } = body;

  // Storefront the request came through — brands share one org and one
  // Stripe account, so the request host is the only brand signal (mirrors
  // guest-checkout.ts).
  const brand = brandFromHost(request.headers.get("host") ?? "");

  const [row] = await db
    .select({
      seasonName: seasons.name,
      programName: programs.name,
      organizationId: organizations.id,
    })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(organizations, eq(organizations.id, sports.organizationId))
    .where(and(eq(seasons.id, seasonId), eq(organizations.status, "active")))
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ error: "Season not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const seasonName = `${row.programName} - ${row.seasonName}`;

  if ("phone" in body) {
    const phone = body.phone; // normalized 10-digit, see PhoneBody
    const e164 = toE164(phone);

    // Evidence-only pending row. See module doc comment: this endpoint never
    // grants opted_in — that would misrepresent a link request as a
    // marketing opt-in nobody gave.
    try {
      await recordPhoneOptIn({
        organizationId: row.organizationId,
        phone,
        consented: false,
        source: RECAPTURE_SOURCE,
      });
    } catch (err) {
      console.error("[register-recapture] opt-in record failed", err);
    }

    if (e164) {
      const appUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
      const link = `${appUrl}/register/${seasonId}?mode=individual&utm_source=inapp_recapture&utm_medium=sms`;
      try {
        // bypassOptInCheck: true — see module doc comment. Without it, the
        // send would be blocked by sendSms's own gate, since the row above
        // is intentionally `pending`, not `opted_in`.
        await sendSms({
          to: e164,
          body: `Finish signing up for ${seasonName}: ${link}`,
          organizationId: row.organizationId,
          bypassOptInCheck: true,
        });
      } catch (err) {
        console.error("[register-recapture] sms failed", err);
      }
    }
  } else {
    const { email } = body;
    // Send the email. Failures are swallowed: the response record is already
    // stored and must not 500 because Resend hiccuped.
    try {
      await sendInappRecaptureEmail({
        email,
        seasonId,
        seasonName,
        brand,
      });
    } catch (err) {
      console.error("[register-recapture] email failed", err);
    }
  }

  // Always { sent: true } — success, failure, and dedupe-suppressed all look
  // identical to the caller (see module doc comment above).
  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
