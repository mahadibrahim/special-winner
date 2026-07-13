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
import { and, desc, eq, sql } from "drizzle-orm";
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
import { createDropInCheckoutSession } from "@/lib/dropin/create-checkout";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

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

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    sessionId?: string;
    waiverAccepted?: boolean;
    waiverName?: string;
    /** `?src=` from the share link the customer booked from (e.g. host-share). */
    src?: string;
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
      brand: brandFromHost(request.headers.get("host") ?? ""),
      referralSource: body.src,
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
  //
  // Duplicate pre-check BEFORE money can move: the free path's orchestrator
  // rejects `already_booked` inside its transaction, but the paid path used
  // to mint a Checkout Session unconditionally — a user with an existing
  // active booking (second tab, kiosk hold, waitlist spot) could complete a
  // payment that buys nothing. The webhook's duplicate-user guard would
  // catch the row insert, but the charge would already exist; kill the
  // duplicate here, before Stripe is involved. (Not race-proof on its own —
  // two concurrent first-time checkouts pass this check; the webhook guard
  // + auto-refund is the transactional backstop.)
  const [existingActive] = await db
    .select({ status: dropInBookings.status })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.userId, locals.user.id),
        sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
      ),
    )
    .limit(1);
  if (existingActive) {
    return json(
      {
        error: {
          code: "already_booked",
          message: "You already have an active booking on this session",
        },
      },
      409,
    );
  }

  if (!stripe) {
    return json({ error: "Stripe not configured" }, 500);
  }

  const checkout = await createDropInCheckoutSession({
    db,
    session,
    user: { id: locals.user.id, email: locals.user.email },
    rate,
    waiverSignedAt,
    waiverName,
    referralSource: body.src,
    // Storefront brand — host-derived, since both brands share one org.
    // Ad-attribution ids → server-side GA4 + Meta purchase conversions.
    extraMetadata: {
      brand: brandFromHost(request.headers.get("host") ?? ""),
      ...collectAdAttribution(url, request.headers.get("cookie")),
    },
    // Stripe success/cancel redirects return to the booking domain.
    origin: url.origin,
  });

  return json(
    {
      paymentRequired: true,
      checkoutUrl: checkout.checkoutUrl,
      checkoutSessionId: checkout.checkoutSessionId,
    },
    200,
  );
};
