/**
 * POST /api/dropin/guest-checkout
 *
 * Guest booking for drop-in sessions — the drop-in counterpart of
 * /api/registrations/guest-checkout. Drop-ins are impulse purchases;
 * bouncing anonymous visitors to /signin was costing the lowest-friction
 * sale in the catalog.
 *
 * Mirrors the registration guest-checkout semantics exactly:
 *   - upsert a passwordless user by email (parent role for new users)
 *   - existing email → booking attaches to that account; NO session
 *     cookie is set (account-takeover prevention), so the booker pays
 *     but can't read the account
 *   - new user → Lucia session cookie so the success page shows their
 *     booking
 *
 * Rate resolution uses the upserted user, so an existing member who
 * guest-books still gets their member rate. Paid path reuses the shared
 * producers in create-checkout.ts — identical webhook metadata contract to
 * the authed endpoint. paymentFlow "embedded" (current UI) mints a deferred
 * PaymentIntent for the inline Payment Element (row created by
 * `payment_intent.succeeded`); the default legacy mode mints a hosted
 * Checkout Session (row created by `checkout.session.completed`). Free
 * path books immediately via the shared orchestrator.
 *
 * Youth CLASS sessions (kind='class') are rejected outright — see the guard
 * below the session lookup.
 *
 * Waitlist is deliberately NOT offered to guests — joining one is a
 * commitment to come back later, which only makes sense with an account.
 * The UI shows "Sign in to join waitlist" when the session is full.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import {
  dropInSessions,
  dropInRateCard,
  dropInBookings,
} from "@/lib/db/schema/drop-in";
import { stripe } from "@/lib/stripe/client";
import { resolveRate } from "@/lib/dropin/pricing";
import {
  createConfirmedBookingFreePath,
  getActiveMembershipForUser,
} from "@/lib/dropin/booking";
import {
  createDropInCheckoutSession,
  createDropInPaymentIntent,
} from "@/lib/dropin/create-checkout";
import { createSession } from "@/lib/auth";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  // OPTIONAL since the sign-before-you-PLAY change — the current UI collects
  // only email + name pre-pay and captures the waiver on the confirmation
  // surface. When a caller does accept, a typed name must come with it
  // (enforced below, after parsing).
  waiverAccepted: z.literal(true).optional(),
  waiverName: z.string().trim().min(1).max(200).optional(),
  /** `?src=` from the share link the guest booked from (e.g. host-share). */
  src: z.string().optional(),
  /** "embedded" → deferred PaymentIntent for the inline Payment Element
   *  (current UI). Absent → legacy hosted Checkout redirect. */
  paymentFlow: z.literal("embedded").optional(),
  /** Client-minted id, fresh per Pay click — Stripe idempotency scope for
   *  the intent create (dedupes duplicate deliveries of one attempt). */
  attemptId: z.string().regex(/^[\w-]{1,64}$/).optional(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress } = context;

  // Signed-in users have the richer authed flow — don't let a stale tab
  // create a second parallel path.
  if (locals.user) {
    return json({ error: "Already signed in — use the standard booking flow" }, 409);
  }

  // Unauthenticated write endpoint → per-IP burst limit.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`dropin-guest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const data = parsed.data;

  // A signature only counts when both halves arrive together.
  const waiverProvided = data.waiverAccepted === true && Boolean(data.waiverName);
  if (data.waiverAccepted === true && !waiverProvided) {
    return json({ error: "waiverName is required when accepting the waiver" }, 400);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, data.sessionId))
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard — booking endpoint is host-scoped.
  if (locals.organization && session.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  if (session.status !== "scheduled") {
    return json({ error: "Session not open for booking" }, 409);
  }

  // Guests can NEVER book a youth class. Class sessions (kind='class',
  // materialized weekly by the class-slot cron) are always booked FOR A
  // CHILD — every class path is keyed to a `family_members` row owned by a
  // signed-in parent, and a class seat is either allotment-drawn, the
  // one-per-child trial, or a paid make-up. This endpoint has no child
  // concept at all, so without the guard a guest could pay into a kids'
  // class and end up with an adult-shaped booking row on it.
  if (session.kind === "class") {
    return json(
      {
        error: {
          code: "class_requires_child",
          message: "Class sessions must be booked for a child by a signed-in parent",
        },
      },
      422,
    );
  }

  // Camp day-sessions (kind='camp') are REGISTRATION-ONLY: bookings on them
  // are created exclusively by the camp materializer's auto-enrollment from
  // paid camp registrations (src/lib/camps/materialize.ts). Without this
  // guard a camp session id falls into the resolveRate + adult pickup
  // rate-card path below — a guest would pay the ~walk-up rate for a
  // week-long youth camp. Same guard vocabulary as /walkin/start and
  // POST /api/dropin/bookings: camp_registration_only.
  if (session.kind === "camp") {
    return json(
      {
        error: {
          code: "camp_registration_only",
          message: "Camp days are included with camp registration and can't be booked individually.",
        },
      },
      422,
    );
  }

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  if (!rateCard) {
    return json({ error: "Rate card not configured" }, 500);
  }

  // Upsert user by email — the SHARED registration helper (#458). The local
  // insert this replaces never computed emailCanonical, so a gmail dot/plus
  // variant of an existing account minted a duplicate user — the exact gap
  // #449 closed for the solo/team paths. upsertGuestUser de-dupes on the
  // canonical form (with the pre-canonical-row self-heal) and assigns the
  // parent role to new users, same semantics as before.
  const { userRow, wasNewUser } = await upsertGuestUser(db, {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
  });

  // existingBooking and membership are independent reads — both only need
  // userRow.id (already resolved above) — fetch concurrently. If
  // existingBooking turns out to block the request below, the membership
  // read is simply discarded (plain SELECT, no side effects).
  const [[existingBooking], membership] = await Promise.all([
    db
      .select({ status: dropInBookings.status })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, data.sessionId),
          eq(dropInBookings.userId, userRow.id),
        ),
      )
      .orderBy(dropInBookings.createdAt)
      .limit(1),
    getActiveMembershipForUser(userRow.id, session.organizationId),
  ]);
  if (
    existingBooking &&
    ["confirmed", "waitlisted", "pending_payment", "pending_claim"].includes(
      existingBooking.status,
    )
  ) {
    return json(
      {
        error:
          "This email already has a booking for this session. Sign in to view it.",
      },
      409,
    );
  }

  const rate = resolveRate(session, userRow, membership, rateCard);
  const waiverSignedAt = waiverProvided ? new Date() : null;

  // Free path → create immediately.
  if (rate.amountCents === 0) {
    const result = await createConfirmedBookingFreePath({
      sessionId: data.sessionId,
      userId: userRow.id,
      source: "online_booking",
      waiverSigned: waiverProvided,
      waiverSignedAt: waiverSignedAt ?? undefined,
      waiverSignedBy: waiverProvided ? data.waiverName : undefined,
      brand: brandFromHost(request.headers.get("host") ?? ""),
      referralSource: data.src,
      // NEVER the born-covered on-file stamp here. `upsertGuestUser` above
      // matches an EXISTING account purely by typed email — unverified
      // (`emailVerified: false`), no session, no OTP. Anyone who knows (or
      // guesses) a covered adult's email could otherwise book a session
      // under that identity and have the liability signature ask silently
      // suppressed on their behalf. The authed endpoint and the staff-
      // operated walk-up desk both keep the stamp (default true); this is
      // the one caller that must opt out.
      allowWaiverOnFileStamp: false,
    });
    if (!result.ok) {
      const httpStatus = result.error.code === "session_not_found" ? 404 : 409;
      return json({ error: result.error }, httpStatus);
    }
    if (wasNewUser) {
      await createSession(userRow.id, context);
    }
    return json(
      {
        bookingId: result.bookingId,
        paymentRequired: false,
        teamAssignment: result.teamAssignment,
        wasNewUser,
      },
      200,
    );
  }

  // Paid path → booking row created on webhook (either mode).
  if (!stripe) {
    return json({ error: "Stripe not configured" }, 500);
  }

  // Inline deferred Payment Element (current UI): mint a bare PaymentIntent
  // carrying the same fulfillment metadata the hosted flow stamps; the card
  // form confirms it in-page, no redirect. Row inserted by
  // payment_intent.succeeded → handle-dropin-booking-payment.ts.
  if (data.paymentFlow === "embedded") {
    const attemptId = data.attemptId ?? crypto.randomUUID();
    const intent = await createDropInPaymentIntent({
      db,
      session,
      user: { id: userRow.id, email: userRow.email },
      rate,
      waiverSignedAt,
      waiverName: waiverProvided ? data.waiverName : null,
      referralSource: data.src,
      extraMetadata: {
        via_guest_checkout: "true",
        // Storefront brand — host-derived, since both brands share one org.
        brand: brandFromHost(request.headers.get("host") ?? ""),
        // Ad-attribution ids → read back by the webhook to fire server-side
        // GA4 + Meta purchase conversions.
        ...collectAdAttribution(context.url, request.headers.get("cookie")),
      },
      idempotencyKey: `dropin-embedded:${data.sessionId}:${userRow.id}:${attemptId}`,
    });

    // Account-takeover prevention: only set a session for genuinely new users.
    if (wasNewUser) {
      await createSession(userRow.id, context);
    }

    return json(
      {
        paymentRequired: true,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        amountCents: intent.amountCents,
        wasNewUser,
      },
      200,
    );
  }

  const checkout = await createDropInCheckoutSession({
    db,
    session,
    user: { id: userRow.id, email: userRow.email },
    rate,
    waiverSignedAt,
    waiverName: waiverProvided ? data.waiverName : null,
    referralSource: data.src,
    extraMetadata: {
      via_guest_checkout: "true",
      // Storefront brand — host-derived, since both brands share one org.
      brand: brandFromHost(request.headers.get("host") ?? ""),
      // Ad-attribution ids → read back by the webhook to fire server-side
      // GA4 + Meta purchase conversions.
      ...collectAdAttribution(context.url, request.headers.get("cookie")),
    },
    // Stripe success/cancel redirects return to the booking domain.
    origin: context.url.origin,
  });

  // Account-takeover prevention: only set a session for genuinely new users.
  if (wasNewUser) {
    await createSession(userRow.id, context);
  }

  return json(
    {
      paymentRequired: true,
      checkoutUrl: checkout.checkoutUrl,
      checkoutSessionId: checkout.checkoutSessionId,
      wasNewUser,
    },
    200,
  );
};
