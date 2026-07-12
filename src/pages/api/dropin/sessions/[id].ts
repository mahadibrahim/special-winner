/**
 * GET /api/dropin/sessions/:id
 *
 * Detail endpoint for the session detail page. Returns:
 *   - the session row
 *   - venue name + venue id
 *   - confirmed count + waitlist count
 *   - rate-card defaults (cancel window, promo window, default rates)
 *   - per-user resolved price IF the request is authenticated
 *
 * The per-user resolved price is what the BookButton displays. Anonymous
 * visitors see the public session rate.
 */
import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { resolveRate } from "@/lib/dropin/pricing";
import { getActiveMembershipForUser } from "@/lib/dropin/booking";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

// pending_payment (kiosk walk-in hold) is included so a customer who
// already holds a walk-in hold sees "already booked" instead of a duplicate
// "Book now" CTA on the public session page — see BookButton.tsx.
const ACTIVE_BOOKING_STATUSES = ["confirmed", "waitlisted", "pending_payment", "pending_claim"];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, locals, url }) => {
  const sessionId = params.id;
  if (!sessionId) return json({ error: "session id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({
      session: dropInSessions,
      venueName: venues.name,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!row) return json({ error: "Session not found" }, 404);

  // Multi-tenant guard.
  if (locals.organization && row.session.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  // confirmedCount backs the capacity meter AND the "is this session full"
  // check the public page uses to switch the CTA to "Join waitlist" — it
  // must count every status that actually occupies a slot, not just
  // 'confirmed'. A pending_payment walk-in hold or a pending_claim promoted
  // waitlister both hold a real seat (the sweep in expireOverduePromotions
  // is what releases it, nothing before that) — undercounting here would
  // let a guest see room that doesn't exist and try to book into an
  // already-held slot.
  // waitlistCount counts ONLY `waitlisted` — pending_claim is deliberately
  // excluded because it's already counted above as taken (a promoted
  // waitlister mid-claim-window occupies the seat, not the queue). Counting
  // it in both places double-reported the same row as both "taken" and
  // "still waiting".
  const [counts] = await db
    .select({
      confirmedCount: sql<number>`COUNT(*) FILTER (WHERE status IN ('confirmed', 'pending_payment', 'pending_claim'))::int`,
      waitlistCount: sql<number>`COUNT(*) FILTER (WHERE status = 'waitlisted')::int`,
    })
    .from(dropInBookings)
    .where(eq(dropInBookings.sessionId, sessionId));

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, row.session.organizationId))
    .limit(1);

  // Resolve the rate. For anonymous visitors this is the public session
  // rate (resolveRate with no user/membership) so the guest booking CTA
  // can show a real price; for authenticated users it's their personal
  // (possibly member) rate.
  let resolvedAmountCents: number | null = null;
  let resolvedPaymentMethod: string | null = null;
  let alreadyBookedStatus: string | null = null;
  if (rateCard) {
    const membership = locals.user
      ? await getActiveMembershipForUser(
          locals.user.id,
          row.session.organizationId,
        )
      : null;
    const rate = resolveRate(row.session, locals.user, membership, rateCard);
    resolvedAmountCents = rate.amountCents;
    resolvedPaymentMethod = rate.paymentMethod;
  }
  if (locals.user) {
    // Active booking lookup so the UI can switch the CTA from "Book" to
    // "View / Cancel".
    const [existing] = await db
      .select({ status: dropInBookings.status })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.userId, locals.user.id),
        ),
      )
      .orderBy(dropInBookings.createdAt)
      .limit(1);
    if (existing && ACTIVE_BOOKING_STATUSES.includes(existing.status)) {
      alreadyBookedStatus = existing.status;
    }
  }

  // Guest fallback: an existing-account guest who booked without signing in
  // returns from Stripe anonymous, so the user lookup above finds nothing and
  // the success page would poll forever. Resolve their booking via the
  // checkout session id carried back in the success_url. The id is a
  // capability only the buyer holds (it's in their redirect URL). Only hit
  // Stripe when we still have no status, to avoid a round-trip per poll for
  // signed-in users.
  const checkoutSessionId = url.searchParams.get("checkout_session_id");
  if (alreadyBookedStatus === null && checkoutSessionId && stripe) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      const paymentIntentId =
        typeof cs.payment_intent === "string"
          ? cs.payment_intent
          : (cs.payment_intent?.id ?? null);
      if (paymentIntentId) {
        const [booked] = await db
          .select({ status: dropInBookings.status })
          .from(dropInBookings)
          .where(
            and(
              eq(dropInBookings.sessionId, sessionId),
              eq(dropInBookings.stripePaymentIntentId, paymentIntentId),
            ),
          )
          .limit(1);
        if (booked && ACTIVE_BOOKING_STATUSES.includes(booked.status)) {
          alreadyBookedStatus = booked.status;
        }
      }
    } catch {
      // Non-fatal: a bad/expired checkout id just leaves the status null and
      // the page falls back to its normal polling/timeout behavior.
    }
  }

  return json(
    {
      session: row.session,
      venueName: row.venueName,
      confirmedCount: counts?.confirmedCount ?? 0,
      waitlistCount: counts?.waitlistCount ?? 0,
      rateCard,
      resolvedAmountCents,
      resolvedPaymentMethod,
      alreadyBookedStatus,
    },
    200,
  );
};
