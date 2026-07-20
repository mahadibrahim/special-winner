/**
 * POST /api/dropin/notify — pickup alert opt-in, guest or signed-in.
 *
 * The public, waiver-free sibling of the kiosk spectator opt-in. It captures
 * INTENT and files evidence; only a verified act (SMS OTP / email double-opt-in)
 * grants consent. Every consent row it writes is `pending`. SMS opt-ins also get
 * a pickup_alert_subscriptions row so the existing fill-alert dispatcher texts
 * them once their number is verified — no dispatcher change needed.
 *
 * Channels (v1): "sms" (capacity alerts, real) and "email" (general updates).
 */
import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import {
  recordMarketingConsent,
  PICKUP_NOTIFY_SOURCE,
} from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { resolveMarketingUser } from "@/lib/consents/resolve-marketing-user";
import { normalizeUsPhone } from "@/lib/sms/send";
import { createPhoneVerification } from "@/lib/auth/phone-otp";
import { mintToken } from "@/lib/check-in/tokens-db";
import { sendEmailConsentConfirmationEmail } from "@/lib/email/send";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { env } from "@/lib/env";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

type NotifyChannel = "sms" | "email";
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

const schema = z
  .object({
    channels: z.array(z.enum(["sms", "email"])).min(1),
    phone: z.string().trim().min(7).max(20).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    venueId: z.string().uuid().nullable().optional(),
    sport: z.string().trim().max(100).nullable().optional(),
    firstName: z.string().trim().max(100).optional(),
    turnstileToken: z.string().optional(),
  })
  // NOTE: no email-channel refine here. Email requirement is enforced in the
  // handler AFTER the account-email fallback (`locals.user?.email ?? input.email`)
  // so a signed-in user may omit body email and opt in under their account email;
  // a guest with no account email to fall back on still 422s ("An email is
  // required"). A parse-time refine would reject the signed-in case before the
  // fallback runs.
  .refine((v) => !v.channels.includes("sms") || !!v.phone, {
    message: "phone is required for SMS",
    path: ["phone"],
  });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const org = locals.organization;
  if (!org) return json({ error: "No organization context" }, 400);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`dropin-notify:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 422);
  const input = parsed.data;

  const signedIn = !!locals.user;

  // Guests must pass Turnstile (this endpoint sends SMS/email unauthenticated).
  if (!signedIn) {
    const ok = await verifyTurnstile(input.turnstileToken ?? "", {
      secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
      isProd: Boolean(import.meta.env.PROD),
    });
    if (!ok) return json({ error: "Please complete the CAPTCHA challenge." }, 400);
  }

  // Email is the user key. Signed-in users fall back to their account email.
  const email = (locals.user?.email ?? input.email)?.trim().toLowerCase();
  if (!email) return json({ error: "An email is required" }, 422);

  const wantsSms = input.channels.includes("sms");
  const phoneE164 = wantsSms ? normalizeUsPhone(input.phone ?? "") : null;
  if (wantsSms && !phoneE164) return json({ error: "A valid US phone is required for texts" }, 422);

  const db = getDb();
  const venueId = input.venueId ?? null;
  const sport = input.sport?.trim().toLowerCase() || null;

  // Already-opted-in SMS for this number? Then no OTP is needed — consent exists.
  let smsAlreadyOptedIn = false;
  if (wantsSms && phoneE164) {
    const [row] = await db
      .select({ status: phoneOptIns.status })
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, org.id),
          eq(phoneOptIns.phone, phoneE164),
          eq(phoneOptIns.channel, "sms"),
        ),
      )
      .orderBy(asc(phoneOptIns.createdAt))
      .limit(1);
    smsAlreadyOptedIn = row?.status === "opted_in";
  }

  const pending: NotifyChannel[] = [];
  const awaitingCode: NotifyChannel[] = [];

  // user + subscription + consent as one fact (mirrors spectator/sign).
  let userId: string | null = null;
  try {
    userId = await db.transaction(async (tx) => {
      const resolvedId =
        locals.user?.id ??
        (await resolveMarketingUser(tx, {
          email,
          firstName: input.firstName ?? null,
          phone: phoneE164 ?? undefined,
        }));

      if (wantsSms) {
        // Upsert (app-level) the alert subscription — reactivate an existing
        // (user, venue, sport) combo rather than duplicate. NULLs make a DB
        // unique index impractical, same as the subscriptions endpoint.
        const existing = await tx
          .select({ id: pickupAlertSubscriptions.id })
          .from(pickupAlertSubscriptions)
          .where(
            and(
              eq(pickupAlertSubscriptions.userId, resolvedId),
              eq(pickupAlertSubscriptions.organizationId, org.id),
              venueId
                ? eq(pickupAlertSubscriptions.venueId, venueId)
                : isNull(pickupAlertSubscriptions.venueId),
              sport
                ? eq(pickupAlertSubscriptions.sport, sport)
                : isNull(pickupAlertSubscriptions.sport),
            ),
          )
          .orderBy(asc(pickupAlertSubscriptions.createdAt))
          .limit(1);
        if (existing.length > 0) {
          await tx
            .update(pickupAlertSubscriptions)
            .set({ active: true, unsubscribedAt: null, updatedAt: new Date() })
            .where(eq(pickupAlertSubscriptions.id, existing[0].id));
        } else {
          await tx
            .insert(pickupAlertSubscriptions)
            .values({ userId: resolvedId, organizationId: org.id, venueId, sport });
        }

        // pending SMS consent (setWhere guards keep an existing opted_in/opted_out row intact)
        await recordMarketingConsent({
          db: tx,
          organizationId: org.id,
          userId: resolvedId,
          channel: "sms",
          phone: phoneE164 ?? undefined,
          source: PICKUP_NOTIFY_SOURCE,
          textShown: CONSENT_COPY.sms,
          status: "pending",
        });
      }

      if (input.channels.includes("email")) {
        await recordMarketingConsent({
          db: tx,
          organizationId: org.id,
          userId: resolvedId,
          channel: "email",
          email,
          source: PICKUP_NOTIFY_SOURCE,
          textShown: CONSENT_COPY.email,
          status: "pending",
        });
      }
      return resolvedId;
    });
  } catch (err) {
    console.error("[dropin/notify] capture failed:", err);
    return json({ ok: true, awaitingCode: [], pending: input.channels }, 200);
  }

  // SMS confirmation: OTP proves the number and promotes the pending consent.
  let phoneVerificationId: string | undefined;
  if (wantsSms && phoneE164) {
    if (smsAlreadyOptedIn) {
      // Already consented — subscription is live now, nothing to confirm.
    } else {
      const otp = await createPhoneVerification({
        phone: phoneE164,
        organizationId: org.id,
        purpose: "registration",
        purposeContext: { source: PICKUP_NOTIFY_SOURCE, organizationId: org.id },
      });
      if (otp.ok) {
        phoneVerificationId = otp.verificationId;
        awaitingCode.push("sms");
      } else {
        pending.push("sms");
      }
    }
  }

  // Email confirmation: the double-opt-in link is email's verified act.
  if (input.channels.includes("email") && userId) {
    let sent = false;
    try {
      const token = await mintToken({
        kind: "email_consent",
        targetId: userId,
        organizationId: org.id,
        venueId: null,
        sentVia: "email",
        recipientUserId: userId,
        recipientEmail: email,
        recipientPhone: phoneE164 ?? null,
        createdByUserId: null,
        ttlHours: 24 * 14,
      });
      const origin = originForBrand(locals.brandId) ?? env.PUBLIC_APP_URL;
      const result = await sendEmailConsentConfirmationEmail({
        userId,
        recipientEmail: email,
        // `name` is typed `string` (not nullable); the template falls back to
        // "there" on an empty string, so an omitted firstName degrades cleanly.
        name: input.firstName ?? "",
        confirmUrl: `${origin}/api/consent/confirm/${token.token}`,
        consentTextShown: CONSENT_COPY.email,
        brand: locals.brandId,
      });
      sent = result.success;
    } catch (err) {
      console.error("[dropin/notify] email confirmation send failed:", err);
    }
    if (sent) awaitingCode.push("email");
    else pending.push("email");
  }

  return json({ ok: true, awaitingCode, pending, phoneVerificationId }, 200);
};
