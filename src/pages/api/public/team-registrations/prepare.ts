import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isRegistrationClosed } from "@/lib/programs/registration-window";
import { effectiveTeamPriceCents } from "@/lib/programs/early-bird";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { getOrCreateStripeCustomer } from "@/lib/memberships/stripe";
import { checkDiscountEligibility, computeDiscountCents } from "@/lib/discounts/validate";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  teamName: z.string().trim().min(1).max(200),
  captainName: z.string().trim().min(1).max(200),
  captainEmail: z.string().trim().toLowerCase().email().max(320),
  notes: z.string().trim().max(2000).optional(),
  backstopConsent: z.literal(true),
  discountCode: z.string().trim().max(50).optional(),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Prepare a team-reserve payment WITHOUT creating any account or team. Returns
 * a $200 deposit PaymentIntent whose metadata carries everything the finalize
 * step needs; the user + team are created only when that intent succeeds.
 *
 * Guests whose email already has an account are bounced to sign-in first
 * (409 needs_sign_in) — we never take a guest payment we can't safely attach.
 */
export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress } = context;
  if (!db) return json({ error: "Database unavailable" }, 503);
  // Stripe is only needed to mint the intent at the very end — input validation,
  // the email gate, and discount checks below don't need it (and shouldn't be
  // masked by a 503 when Stripe is merely unconfigured, e.g. on CI).

  const org = locals.organization;
  if (!org) return json({ error: "Organization context required" }, 400);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`team-prepare:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) return json({ error: "Invalid input", issues: parsed.error.issues }, 400);
  const { seasonId, teamName, captainName, captainEmail, notes, discountCode } = parsed.data;

  // A guest whose email already has an account is NOT forced to sign in first
  // (that off-site magic-link detour before payment was the biggest team-funnel
  // leak). They reserve as a guest exactly like the solo path: finalize resolves
  // the existing user by email and attaches the team, and — because a session is
  // only ever created for a NEW user (finalize.ts / upsertGuestUser wasNewUser
  // gate) — a guest is never logged in as an existing account. Sign-in remains
  // available (offered inline in the form) for anyone who prefers it.
  const captainUserId: string | null = locals.user?.id ?? null;

  // Season + team fee (early-bird aware), and the registration window gate.
  const [season] = await db
    .select({
      id: seasons.id,
      teamPriceCents: seasons.teamPriceCents,
      priceCents: seasons.priceCents,
      earlyBirdDeadline: seasons.earlyBirdDeadline,
      earlyBirdTeamPriceCents: seasons.earlyBirdTeamPriceCents,
      registrationCloses: seasons.registrationCloses,
      startDate: seasons.startDate,
    })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!season) return json({ error: "Season not found" }, 404);
  if (isRegistrationClosed(season)) return json({ error: "Registration for this season has closed" }, 400);

  const listTeamFeeCents = season.teamPriceCents ?? season.priceCents;
  const effectiveFeeCents = effectiveTeamPriceCents(season, listTeamFeeCents);

  // Optional discount: validate + guard that it can't drop the team total to or
  // below the deposit (a $200 deposit is always due).
  let discountCents = 0;
  let discountCodeId: string | null = null;
  let discountCodeStr: string | null = null;
  if (discountCode) {
    const eligibility = await checkDiscountEligibility(db, {
      code: discountCode,
      organizationId: org.id,
      seasonId,
      purchaseAmountCents: effectiveFeeCents,
      userId: captainUserId ?? undefined,
    });
    if (!eligibility.ok) return json({ error: eligibility.error, discount: false }, 200);
    const computed = computeDiscountCents(eligibility.code, effectiveFeeCents);
    const maxOff = effectiveFeeCents - CAPTAIN_DEPOSIT_CENTS;
    if (computed > maxOff) {
      return json(
        {
          discount: false,
          error: `A $${CAPTAIN_DEPOSIT_CENTS / 100} deposit is always due today, so a code can take at most $${(maxOff / 100).toLocaleString()} off this team. This one's larger than that.`,
        },
        200,
      );
    }
    discountCents = computed;
    discountCodeId = eligibility.code.id;
    discountCodeStr = eligibility.code.code;
  }

  const teamFeeCents = effectiveFeeCents - discountCents;

  // Everything validated — now we actually need Stripe to mint the deposit.
  if (!stripe) return json({ error: "Payments are temporarily unavailable" }, 503);

  // Stripe customer: authed → reuse the user's; guest → a bare customer keyed
  // by email (a billing object, not an app account). The card is saved
  // off-session for the post-deadline backstop.
  let customerId: string;
  try {
    customerId = captainUserId
      ? await getOrCreateStripeCustomer({ userId: captainUserId, email: captainEmail })
      : (await stripe.customers.create({ email: captainEmail, metadata: { pending_team_deposit: "1" } })).id;
  } catch (err) {
    console.error("[team-prepare] customer create failed", err);
    return json({ error: "We couldn't start your reservation. Please try again." }, 502);
  }

  // Attribution riders: ph_distinct_id / gclid / fbclid etc. + the PostHog
  // session id, read back by finalizeTeamDeposit so the deposit's analytics
  // events join the captain's browser session and person (mirrors
  // guest-checkout.ts).
  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
  const metadata: Record<string, string> = {
    kind: "team_deposit_pending",
    organizationId: org.id,
    seasonId,
    captainEmail,
    captainName,
    teamName,
    backstopConsent: "true",
    brand: brandFromHost(request.headers.get("host") ?? ""),
    teamFeeCents: String(teamFeeCents),
    ...collectAdAttribution(context.url, request.headers.get("cookie")),
    ...(phSessionId ? { ph_session_id: phSessionId } : {}),
  };
  if (notes) metadata.notes = notes;
  if (captainUserId) metadata.captainUserId = captainUserId;
  if (discountCodeId) {
    metadata.discountCodeId = discountCodeId;
    metadata.discountCents = String(discountCents);
    if (discountCodeStr) metadata.discountCode = discountCodeStr;
  }

  let clientSecret: string;
  try {
    const pi = await stripe.paymentIntents.create({
      amount: CAPTAIN_DEPOSIT_CENTS,
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card"],
      setup_future_usage: "off_session",
      metadata,
    });
    clientSecret = pi.client_secret!;
  } catch (err) {
    console.error("[team-prepare] intent create failed", err);
    return json({ error: "We couldn't start your deposit. Please try again." }, 502);
  }

  return json(
    {
      ok: true,
      clientSecret,
      publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
      teamFeeCents,
      discountCents,
      discountCode: discountCodeStr,
    },
    200,
  );
};
