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
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInRateCard,
  dropInBookings,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { resolveRate } from "@/lib/dropin/pricing";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";
import {
  buildDropInCheckoutLineItems,
  dropInPaymentDescription,
} from "@/lib/dropin/checkout-line-item";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { organizations } from "@/lib/db/schema/organizations";

export const prerender = false;

/**
 * GET /api/dropin/bookings → list the authenticated user's drop-in
 * bookings (any status). Used by the dashboard panel.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: dropInBookings.id,
      sessionId: dropInBookings.sessionId,
      status: dropInBookings.status,
      paymentMethod: dropInBookings.paymentMethod,
      amountPaidCents: dropInBookings.amountPaidCents,
      teamAssignment: dropInBookings.teamAssignment,
      checkedInAt: dropInBookings.checkedInAt,
      createdAt: dropInBookings.createdAt,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      venueName: venues.name,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(eq(dropInBookings.userId, locals.user.id))
    .orderBy(desc(dropInSessions.startsAt));

  return new Response(
    JSON.stringify({
      bookings: rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        status: r.status,
        paymentMethod: r.paymentMethod,
        amountPaidCents: r.amountPaidCents,
        teamAssignment: r.teamAssignment,
        checkedInAt: r.checkedInAt ?? null,
        createdAt: r.createdAt,
        session: {
          sportOrClassLabel: r.sportOrClassLabel,
          formatLabel: r.formatLabel,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          venueName: r.venueName,
        },
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    sessionId?: string;
    waiverAccepted?: boolean;
    waiverName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.sessionId;
  if (!sessionId) {
    return json({ error: "sessionId required" }, 400);
  }

  // Waiver acceptance is required for all customer-facing direct bookings.
  if (body.waiverAccepted !== true) {
    return json({ error: "Waiver acceptance is required" }, 422);
  }
  const waiverName = typeof body.waiverName === "string" ? body.waiverName.trim() : "";
  if (!waiverName) {
    return json({ error: "waiverName is required" }, 422);
  }
  const waiverSignedAt = new Date();

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
      waiverSigned: true,
      waiverSignedAt,
      waiverSignedBy: waiverName,
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

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  // Drop-in checkout is card-only, so the card surcharge always applies.
  const surchargeCents = computeSurchargeCents(rate.amountCents, "card");

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  // The surcharge is our card-cost recovery, not partner revenue — when
  // funds settle on a partner account, claw it back via the application
  // fee on top of our usual percentage cut.
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rate.amountCents * applicationFeePct) / 100) + surchargeCents
    : undefined;

  // Human-readable description for the PaymentIntent — what shows in the
  // Stripe dashboard payment list and on refunds (Stripe otherwise falls
  // back to the raw pi_… id).
  const paymentDescription = dropInPaymentDescription({
    sportOrClassLabel: session.sportOrClassLabel,
    formatLabel: session.formatLabel,
    startsAt: session.startsAt,
    venueName: venue?.name ?? null,
    timezone: org?.timezone ?? null,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: locals.user.email,
    line_items: buildDropInCheckoutLineItems({
      sportOrClassLabel: session.sportOrClassLabel,
      formatLabel: session.formatLabel,
      startsAt: session.startsAt,
      venueName: venue?.name ?? null,
      timezone: org?.timezone ?? null,
      baseAmountCents: rate.amountCents,
      surchargeCents,
    }),
    metadata: {
      type: "dropin_booking",
      session_id: sessionId,
      user_id: locals.user.id,
      payment_method: rate.paymentMethod,
      membership_id: rate.membershipId ?? "",
      organization_id: session.organizationId,
      waiver_signed_at: waiverSignedAt.toISOString(),
      waiver_name: waiverName,
    },
    payment_intent_data: {
      description: paymentDescription,
      ...(partnerStripeAccountId
        ? {
            application_fee_amount: applicationFeeCents,
            transfer_data: { destination: partnerStripeAccountId },
          }
        : {}),
    },
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
