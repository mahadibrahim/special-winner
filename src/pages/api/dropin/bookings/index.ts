/**
 * POST /api/dropin/bookings
 *
 * Single endpoint for the customer-facing book action. Resolves the rate
 * for the authenticated user against the session and:
 *   - amountCents === 0  → create the booking immediately via the
 *                         free-path orchestrator and return a 200 with
 *                         paymentRequired: false.
 *   - amountCents > 0    → create a Stripe Checkout Session and return
 *                         the URL. The booking row is inserted by the
 *                         `checkout.session.completed` webhook handler
 *                         to avoid orphan rows on Checkout abandonment.
 *
 * Marketplace fee: when the venue carries `partnerStripeAccountId`, the
 * Checkout Session uses Connect `transfer_data` so funds settle on the
 * partner account net of our `partnerApplicationFeePct` cut.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { resolveRate } from "@/lib/dropin/pricing";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.sessionId;
  if (!sessionId) {
    return json({ error: "sessionId required" }, 400);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard — booking endpoint is host-scoped.
  if (
    locals.organization &&
    session.organizationId !== locals.organization.id
  ) {
    return json({ error: "Forbidden" }, 403);
  }

  if (session.status !== "scheduled") {
    return json({ error: "Session not open for booking" }, 409);
  }

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  if (!rateCard) {
    return json({ error: "Rate card not configured" }, 500);
  }

  const membership = await getActiveMembershipForUser(
    locals.user.id,
    session.organizationId,
  );
  const rate = resolveRate(session, locals.user, membership, rateCard);

  // Free path → create immediately.
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId,
      userId: locals.user.id,
      source: "online_booking",
    });
    if (!result.ok) {
      const httpStatus = result.error.code === "session_not_found" ? 404 : 409;
      return json({ error: result.error }, httpStatus);
    }
    return json(
      {
        bookingId: result.bookingId,
        paymentRequired: false,
        teamAssignment: result.teamAssignment,
      },
      200,
    );
  }

  // Paid path → Stripe Checkout. Booking row created on webhook.
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 500);
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, session.venueId))
    .limit(1);

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rate.amountCents * applicationFeePct) / 100)
    : undefined;

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: locals.user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${session.sportOrClassLabel} drop-in`,
            description: `${new Date(session.startsAt).toISOString()} at ${
              venue?.name ?? "venue"
            }`,
          },
          unit_amount: rate.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "dropin_booking",
      session_id: sessionId,
      user_id: locals.user.id,
      payment_method: rate.paymentMethod,
      membership_id: rate.membershipId ?? "",
      organization_id: session.organizationId,
    },
    payment_intent_data: partnerStripeAccountId
      ? {
          application_fee_amount: applicationFeeCents,
          transfer_data: { destination: partnerStripeAccountId },
        }
      : undefined,
    success_url: `${appUrl}/dropin/${sessionId}?booking=success`,
    cancel_url: `${appUrl}/dropin/${sessionId}?booking=cancelled`,
  });

  return json(
    {
      paymentRequired: true,
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
    },
    200,
  );
};
