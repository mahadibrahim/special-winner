/**
 * POST /api/dropin/bookings
 *
 * Single endpoint for the customer-facing book action. Resolves the rate
 * for the authenticated user against the session and:
 *   - amountCents === 0  → create the booking immediately via the
 *                         free-path orchestrator and return a 200 with
 *                         paymentRequired: false.
 *   - amountCents > 0    → two request modes:
 *       - paymentFlow "embedded" (current UI): create a bare PaymentIntent
 *         and return { clientSecret, amountCents } for the inline deferred
 *         Payment Element on the session page. The booking row is inserted
 *         by the `payment_intent.succeeded` webhook handler
 *         (metadata.type "dropin_booking_embedded").
 *       - default (legacy): create a hosted Stripe Checkout Session and
 *         return the URL; row inserted by `checkout.session.completed`.
 *     Either way the row is webhook-inserted, so abandonment leaves no
 *     orphan rows.
 *
 * Marketplace fee: when the venue carries `partnerStripeAccountId`, the
 * Checkout Session uses Connect `transfer_data` so funds settle on the
 * partner account net of our `partnerApplicationFeePct` cut.
 *
 * `familyMemberId` (optional) — the CHILD paid make-up path. Set by the
 * classes UI when `POST /api/classes/book` returns 402 `allotment_exhausted`
 * (the child's monthly class allotment is used up): the parent pays to make
 * up the child's spot rather than drawing from the allotment. Validated
 * here (must be the caller's dependent, and the session must be
 * `kind: "class"`), threaded into checkout/PaymentIntent metadata as
 * `family_member_id`, and recorded on the booking row by the webhook
 * fulfillment core (see handle-dropin-checkout-complete.ts). Absent (the
 * normal adult drop-in booking) → behavior is unchanged from before this
 * field existed.
 *
 * Price for the child path is NOT taken from the client (the 402 quote is
 * informational only, from an unrelated request) and NOT from the parent's
 * own adult membership (irrelevant to the child). It is re-derived here by
 * checking whether the CHILD holds an active membership
 * (`getActiveChildMembership`): active → the class member rate; otherwise
 * → the plain public class rate. Both come from the SESSION only — a class
 * session with no rate of its own returns 409 `class_rate_not_configured`
 * rather than falling back to the org's adult pickup rate card (see
 * src/lib/classes/class-rate.ts). See the inline comment at the override
 * site below for the full reasoning.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInRateCard,
  dropInBookings,
} from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { resolveRate } from "@/lib/dropin/pricing";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { classRateNotConfigured } from "@/lib/classes/class-rate";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";
import {
  createDropInCheckoutSession,
  createDropInPaymentIntent,
} from "@/lib/dropin/create-checkout";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      waiverSigned: dropInBookings.waiverSigned,
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
        waiverSigned: r.waiverSigned,
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
    /** "embedded" → deferred PaymentIntent for the inline Payment Element
     *  (current UI). Absent → legacy hosted Checkout redirect. */
    paymentFlow?: string;
    /** Client-minted id, fresh per Pay click — Stripe idempotency scope for
     *  the intent create (dedupes duplicate deliveries of one attempt). */
    attemptId?: string;
    /** Optional — the child paid make-up path. Must be the caller's
     *  dependent and the session must be `kind: "class"`. See the file
     *  doc comment above. */
    familyMemberId?: string;
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

  // Waiver is OPTIONAL at booking time (sign before you PLAY, not before
  // you pay): the current UI books/pays first and captures the signature on
  // the confirmation surface (POST /api/dropin/bookings/[id]/waiver), with
  // email/dashboard/host-roster backstops. When a caller DOES send a
  // signature (legacy clients, kiosk-adjacent flows), record it exactly as
  // before — but an accepted-without-name payload is still malformed.
  const waiverName = typeof body.waiverName === "string" ? body.waiverName.trim() : "";
  const waiverProvided = body.waiverAccepted === true && waiverName.length > 0;
  if (body.waiverAccepted === true && !waiverProvided) {
    return json({ error: "waiverName is required when accepting the waiver" }, 422);
  }
  if (waiverName.length > 200) {
    return json({ error: "waiverName too long" }, 422);
  }
  const waiverSignedAt = waiverProvided ? new Date() : null;

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

  // Child paid make-up: validate ownership before anything else — the
  // family_members row must belong to this parent, or 404 (never leak
  // whether the id exists under another user). Restricted to class
  // sessions: the concept only makes sense there (the child's exhausted
  // monthly class allotment), and it keeps every other branch below
  // (existing-booking dedupe, capacity, refunds) exactly as it behaves for
  // adult pickup bookings today.
  let familyMemberId: string | null = null;
  if (typeof body.familyMemberId === "string") {
    if (!UUID_RX.test(body.familyMemberId)) {
      return json({ error: "Invalid familyMemberId" }, 422);
    }
    if (session.kind !== "class") {
      return json({ error: "familyMemberId is only valid for class sessions" }, 400);
    }
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, body.familyMemberId),
          eq(familyMembers.parentUserId, locals.user.id),
        ),
      )
      .limit(1);
    if (!child) return json({ error: "Family member not found" }, 404);
    familyMemberId = child.id;
  }

  // The inverse guard: a class session can ONLY be booked FOR A CHILD. Every
  // class booking path (allotment, trial, paid make-up) is keyed to a
  // `family_members` row, and the class product itself is a kids' program.
  // Without this, an authed adult could POST a bare `{ sessionId }` for a
  // cron-materialized class session and book THEMSELVES into a children's
  // class — free, if they hold an unlimited_pickup membership (`resolveRate`
  // has no notion of session kind). The make-up path (familyMemberId
  // present, validated above) is unaffected.
  if (session.kind === "class" && !familyMemberId) {
    return json(
      {
        error: {
          code: "class_requires_child",
          message: "Class sessions must be booked for a child (familyMemberId required)",
        },
      },
      422,
    );
  }

  // rateCard and membership are independent reads (rate card is org-scoped,
  // membership is user+org-scoped) — fetch concurrently.
  const [[rateCard], membership] = await Promise.all([
    db
      .select()
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, session.organizationId))
      .limit(1),
    getActiveMembershipForUser(locals.user.id, session.organizationId),
  ]);
  if (!rateCard) {
    return json({ error: "Rate card not configured" }, 500);
  }

  let rate = resolveRate(session, locals.user, membership, rateCard);

  // Child paid make-up: `resolveRate` above resolved the PARENT's own adult
  // drop-in membership (rule 2-4). That's the wrong membership for this
  // decision on TWO counts, and both must be corrected before a price is
  // charged:
  //   1. It must never DISCOUNT here — a parent's own adult membership has
  //      nothing to do with their child's class allotment, and `resolveRate`
  //      would otherwise apply the parent's member rate (or even $0) to a
  //      child booking the parent's membership was never meant to cover.
  //   2. The member RATE (vs. the plain public rate) must only apply when
  //      the CHILD holds an active membership — server-verified here via
  //      `getActiveChildMembership`, never trusted from the client. Without
  //      this, any authed parent could pass an arbitrary `familyMemberId`
  //      (their own, ownership-checked above, but with no membership at
  //      all) and get the discounted class rate on any class session.
  //      `POST /api/classes/book`'s 402 is only a client-facing quote, not
  //      an authorization signal this endpoint can trust — it's a separate
  //      request with no server-side link to this one.
  // Both branches below read the rate off the SESSION, and ONLY off the
  // session: for a materialized class session those values were copied from
  // its class-slot template (src/lib/classes/materialize.ts), i.e. a real
  // CLASS price. There is deliberately no `?? rateCard.*` tail — that card is
  // the ADULT PICKUP price list, and charging a parent an adult drop-in price
  // for their kid's make-up class is worse than refusing the sale. A class
  // whose template left the rate unset is a config error: 409
  // `class_rate_not_configured` with ops visibility (see class-rate.ts).
  // `familyMemberId` is only ever set for `session.kind === "class"` (guarded
  // above), so this never touches pickup pricing.
  if (familyMemberId) {
    const childMembership = await getActiveChildMembership(
      familyMemberId,
      session.organizationId,
    );
    const activeChildMembership =
      childMembership && childMembership.status === "active" ? childMembership : null;
    // No active child membership → the plain public class rate, deliberately
    // NOT `resolveRate`'s result (which reflects the parent's own membership,
    // irrelevant to the child).
    const classRateCents = activeChildMembership
      ? session.memberRateCents
      : session.sessionRateCents;
    if (classRateCents === null) {
      return classRateNotConfigured(
        session,
        activeChildMembership ? "member" : "session",
        { component: "api/dropin/bookings" },
      );
    }
    rate = {
      amountCents: classRateCents,
      paymentMethod: "card_online",
      membershipId: activeChildMembership?.id ?? null,
    };
    // Backstop for a rate that IS configured but nonsensical (0 or negative):
    // a class booking must never take the free path below, which knows
    // nothing about family members and would book the PARENT.
    if (rate.amountCents <= 0) {
      return json({ error: "Rate not configured for this class" }, 500);
    }
  }

  // Free path → create immediately. Never for the child make-up path — its
  // rate is always > 0 (guarded above), and `createConfirmedBookingFreePath`
  // doesn't know about family members; it would silently book the PARENT.
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId,
      userId: locals.user.id,
      source: "online_booking",
      waiverSigned: waiverProvided,
      waiverSignedAt: waiverSignedAt ?? undefined,
      waiverSignedBy: waiverProvided ? waiverName : undefined,
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
  // Participant-scoped: matches the DB's own dedupe key
  // (drop_in_bookings_one_active_per_participant_session_v3, keyed on
  // COALESCE(family_member_id, user_id)). Without this, a parent buying a
  // second child's make-up on the same session would be wrongly blocked as
  // "already booked" by the first child's row. When familyMemberId is
  // absent this is byte-for-byte the original adult-only query.
  const participantFilter = familyMemberId
    ? eq(dropInBookings.familyMemberId, familyMemberId)
    : eq(dropInBookings.userId, locals.user.id);
  const [existingActive] = await db
    .select({ status: dropInBookings.status })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        participantFilter,
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

  // Inline deferred Payment Element (current UI): mint a bare PaymentIntent
  // carrying the same fulfillment metadata the hosted flow stamps; the card
  // form confirms it in-page, no redirect. Row inserted by
  // payment_intent.succeeded → handle-dropin-booking-payment.ts.
  if (body.paymentFlow === "embedded") {
    const attemptId =
      typeof body.attemptId === "string" && /^[\w-]{1,64}$/.test(body.attemptId)
        ? body.attemptId
        : crypto.randomUUID();
    const intent = await createDropInPaymentIntent({
      db,
      session,
      user: { id: locals.user.id, email: locals.user.email },
      rate,
      waiverSignedAt,
      waiverName: waiverProvided ? waiverName : null,
      referralSource: body.src,
      extraMetadata: {
        brand: brandFromHost(request.headers.get("host") ?? ""),
        ...collectAdAttribution(url, request.headers.get("cookie")),
        ...(familyMemberId ? { family_member_id: familyMemberId } : {}),
      },
      idempotencyKey: `dropin-embedded:${sessionId}:${locals.user.id}:${attemptId}`,
    });
    return json(
      {
        paymentRequired: true,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        amountCents: intent.amountCents,
      },
      200,
    );
  }

  const checkout = await createDropInCheckoutSession({
    db,
    session,
    user: { id: locals.user.id, email: locals.user.email },
    rate,
    waiverSignedAt,
    waiverName: waiverProvided ? waiverName : null,
    referralSource: body.src,
    // Storefront brand — host-derived, since both brands share one org.
    // Ad-attribution ids → server-side GA4 + Meta purchase conversions.
    extraMetadata: {
      brand: brandFromHost(request.headers.get("host") ?? ""),
      ...collectAdAttribution(url, request.headers.get("cookie")),
      ...(familyMemberId ? { family_member_id: familyMemberId } : {}),
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
