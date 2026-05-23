/**
 * POST /api/kiosk/[locationSlug]/walkin/payment
 *
 * Creates a Stripe PaymentIntent for a walk-in booking that was initiated
 * by walkin/start. The kiosk wizard renders a PaymentElement using the
 * returned client_secret.
 *
 * Flow:
 *   1. requireKioskLocation(slug) — authorize the kiosk facility
 *   2. verifyToken(token) — must be kind=walkin_session
 *   3. Load dropInBookings by tok.targetId — must still be pending_claim
 *   4. Load dropInSessions → dropInRateCard for amountDueCents
 *   5. Create Stripe PaymentIntent (base + card surcharge) with a
 *      human-readable description and Connect-aware transfer
 *   6. Return { clientSecret, amountCents, baseAmountCents, surchargeCents }
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { stripe } from "@/lib/stripe/client";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { dropInPaymentDescription } from "@/lib/dropin/checkout-line-item";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.locationSlug ?? "";
  // The kiosk facility only authorizes the request — the booking, session,
  // and partner venue are all derived from the token's targetId below.
  const locationResult = await requireKioskLocation(slug);
  if (!locationResult.ok) return locationResult.response;
  const { location } = locationResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const tokenValue = body.token as string | undefined;
  if (!tokenValue) return json({ error: "token is required" }, 422);

  // --- Verify token ---
  const verifyResult = await verifyToken(tokenValue);
  if (!verifyResult.ok) {
    const statusMap: Record<typeof verifyResult.reason, number> = {
      bad_shape: 422,
      not_found: 404,
      expired: 410,
      consumed: 409,
    };
    return json({ error: verifyResult.reason }, statusMap[verifyResult.reason]);
  }

  const tok = verifyResult.token;
  if (tok.kind !== "walkin_session") {
    return json({ error: "Token is not a walkin_session token" }, 422);
  }

  const db = getDb();

  // --- Load booking ---
  const [booking] = await db
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.id, tok.targetId))
    .limit(1);

  if (!booking) return json({ error: "Booking not found" }, 404);
  if (booking.status !== "pending_claim") {
    return json({ error: `Booking is no longer pending (status: ${booking.status})` }, 409);
  }

  // --- Load session for rate resolution and venue partner info ---
  const [sessionRow] = await db
    .select({
      id: dropInSessions.id,
      sessionRateCents: dropInSessions.sessionRateCents,
      organizationId: dropInSessions.organizationId,
      venueId: dropInSessions.venueId,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, booking.sessionId))
    .limit(1);

  if (!sessionRow) return json({ error: "Session not found" }, 404);

  // --- Load partner Stripe info for the session's venue ---
  // Keyed off the session's venueId (not the kiosk param): the kiosk is now
  // facility-scoped, and the partner Stripe split belongs to the specific
  // space the session runs in.
  const [venueRow] = await db
    .select({
      name: venues.name,
      partnerStripeAccountId: venues.partnerStripeAccountId,
      partnerApplicationFeePct: venues.partnerApplicationFeePct,
    })
    .from(venues)
    .where(eq(venues.id, sessionRow.venueId))
    .limit(1);

  // --- Resolve rate ---
  let [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, sessionRow.organizationId))
    .limit(1);
  if (!rateCard) {
    await db
      .insert(dropInRateCard)
      .values({ organizationId: sessionRow.organizationId })
      .onConflictDoNothing();
    [rateCard] = await db
      .select()
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, sessionRow.organizationId))
      .limit(1);
  }
  const amountCents =
    sessionRow.sessionRateCents ?? rateCard?.defaultSessionRateCents ?? 1500;

  // Kiosk walk-in is always a card payment — apply the same card surcharge
  // the online drop-in checkout adds, so a walk-in costs the customer the
  // same as booking online.
  const surchargeCents = computeSurchargeCents(amountCents, "card");
  const totalCents = amountCents + surchargeCents;

  // --- Stripe check ---
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 503);
  }

  // --- Connect-aware PaymentIntent ---
  const partnerStripeAccountId = venueRow?.partnerStripeAccountId ?? null;
  const applicationFeePct = venueRow?.partnerApplicationFeePct ?? 0;
  // The surcharge is our card-cost recovery, not partner revenue — when funds
  // settle on a partner account, claw it back via the application fee on top
  // of our usual percentage cut (mirrors the online drop-in checkout).
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((amountCents * applicationFeePct) / 100) + surchargeCents
    : undefined;

  // Human-readable description — Stripe otherwise shows the raw pi_… id in
  // the dashboard payment list and on refunds.
  const paymentDescription = dropInPaymentDescription({
    sportOrClassLabel: sessionRow.sportOrClassLabel,
    formatLabel: sessionRow.formatLabel,
    startsAt: sessionRow.startsAt,
    venueName: venueRow?.name ?? null,
    timezone: location.timezone,
  });

  // Idempotency key mirrors rentals/bookings/index.ts convention
  const idempotencyKey = `${booking.id}:dropin-walkin:${totalCents}`;

  // Kiosk payment is card-only — a walk-in pays at the front desk to play
  // now. Prefer a Payment Method Configuration when STRIPE_KIOSK_PMC_ID is
  // set: a PMC is the only thing that also suppresses Stripe Link, which
  // `payment_method_types` cannot exclude. Link stays on everywhere else
  // (registration, drop-in checkout, rentals) via the account default
  // config. Without the env var, fall back to an explicit card-only
  // `payment_method_types` so the kiosk still works — Link may appear until
  // the PMC is configured.
  const kioskPmcId = process.env.STRIPE_KIOSK_PMC_ID;
  const methodSelection = kioskPmcId
    ? { payment_method_configuration: kioskPmcId }
    : { payment_method_types: ["card"] };

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        description: paymentDescription,
        // Stripe emails its own card receipt to this address on success.
        ...(tok.recipientEmail ? { receipt_email: tok.recipientEmail } : {}),
        ...methodSelection,
        metadata: {
          type: "dropin_walkin",
          booking_id: booking.id,
          organization_id: sessionRow.organizationId,
          session_id: booking.sessionId,
        },
        ...(partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : {}),
      },
      { idempotencyKey },
    );

    return json(
      {
        clientSecret: intent.client_secret,
        amountCents: totalCents,
        baseAmountCents: amountCents,
        surchargeCents,
      },
      200,
    );
  } catch (err) {
    console.error("[walkin/payment] PaymentIntent creation failed", err);
    return json({ error: "Could not create payment intent" }, 502);
  }
};
