/**
 * POST /api/kiosk/[venueSlug]/walkin/payment
 *
 * Creates a Stripe PaymentIntent for a walk-in booking that was initiated
 * by walkin/start. The kiosk wizard renders a PaymentElement using the
 * returned client_secret.
 *
 * Flow:
 *   1. requireKioskVenue(slug)
 *   2. verifyToken(token) — must be kind=walkin_session
 *   3. Load dropInBookings by tok.targetId — must still be pending_claim
 *   4. Load dropInSessions → dropInRateCard for amountDueCents
 *   5. Create Stripe PaymentIntent with Connect-aware transfer when
 *      venue.partnerStripeAccountId is set
 *   6. Return { clientSecret, amountCents }
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.venueSlug ?? "";
  const venueResult = await requireKioskVenue(slug);
  if (!venueResult.ok) return venueResult.response;
  const { venue } = venueResult;

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
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, booking.sessionId))
    .limit(1);

  if (!sessionRow) return json({ error: "Session not found" }, 404);

  // --- Load venue partner Stripe info (re-query venues to get partnerStripeAccountId) ---
  const [venueRow] = await db
    .select({
      partnerStripeAccountId: venues.partnerStripeAccountId,
      partnerApplicationFeePct: venues.partnerApplicationFeePct,
    })
    .from(venues)
    .where(eq(venues.id, venue.id))
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

  // --- Stripe check ---
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 503);
  }

  // --- Connect-aware PaymentIntent ---
  const partnerStripeAccountId = venueRow?.partnerStripeAccountId ?? null;
  const applicationFeePct = venueRow?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((amountCents * applicationFeePct) / 100)
    : undefined;

  // Idempotency key mirrors rentals/bookings/index.ts convention
  const idempotencyKey = `${booking.id}:dropin-walkin:${amountCents}`;

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        // Card only. A walk-in pays at the front desk to play right now;
        // ACH and BNPL methods (the automatic_payment_methods default)
        // don't settle in time and don't fit an in-person kiosk flow.
        payment_method_types: ["card"],
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

    return json({ clientSecret: intent.client_secret, amountCents }, 200);
  } catch (err) {
    console.error("[walkin/payment] PaymentIntent creation failed", err);
    return json({ error: "Could not create payment intent" }, 502);
  }
};
