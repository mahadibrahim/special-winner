/**
 * POST /api/classes/bookings/:id/cancel
 *
 * Customer-facing cancel for a CHILD class booking (member-allotment or
 * trial — both rows inserted by `createChildClassBooking`, and the paid
 * make-up rows inserted by the webhook fulfillment core also flow through
 * here since they share the same `drop_in_bookings` table).
 *
 * Cutoff policy: a 24h window before the session start, applied UNIFORMLY
 * to member and trial bookings alike (see `isBeforeCutoff`'s doc comment in
 * src/lib/classes/book-child.ts for why trial gets no special-casing).
 * Outside the window (>= 24h before start) → cancelled. Inside the window
 * (< 24h before start) → 409 `inside_cutoff`, no cancellation at all — this
 * is a HARDER gate than `processCancelRefund`'s own window check below (that
 * one only decides refund-or-forfeit; it never blocks the cancel itself).
 * Ownership + org-scope + active-status + the 24h cutoff are all enforced
 * here, BEFORE delegating the actual cancellation to `processCancelRefund`.
 *
 * The cancellation itself (status flip, Stripe refund for paid `card_online`
 * make-ups, waitlist promotion — a class session's paid-overflow branch can
 * leave `waitlisted` rows just like a pickup session) is delegated to
 * `processCancelRefund` (src/lib/dropin/refund.ts) rather than reimplemented
 * here, so classes get the same refund/promotion behavior pickup bookings
 * already have instead of a second, easily-drifting copy of it.
 *
 * `creditFreed` reports whether a member-allotment credit was given back —
 * the allotment is COUNT-based (see get-child-membership.ts), so flipping
 * the row's status to `cancelled` IS the credit-free operation; there is no
 * separate counter to decrement. `refunded` reports whether
 * `processCancelRefund` actually returned money via Stripe (only possible
 * for a paid `card_online` make-up booking outside its own window check).
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { ACTIVE_BOOKING_STATUS_LIST, isBeforeCutoff } from "@/lib/classes/book-child";
import { processCancelRefund } from "@/lib/dropin/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const id = params.id;
  if (!id) return json({ error: "Booking id required" }, 400);

  const db = getDb();

  // Org-scoped via the session join — a booking id from another org (or a
  // nonexistent one) 404s rather than leaking existence.
  const [row] = await db
    .select({
      booking: dropInBookings,
      sessionStartsAt: dropInSessions.startsAt,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .where(
      and(
        eq(dropInBookings.id, id),
        eq(dropInSessions.organizationId, locals.organization.id),
      ),
    )
    .limit(1);
  if (!row) return json({ error: "Booking not found" }, 404);

  if (row.booking.userId !== locals.user.id) {
    return json({ error: "Not your booking" }, 403);
  }

  if (!(ACTIVE_BOOKING_STATUS_LIST as readonly string[]).includes(row.booking.status)) {
    return json({ error: "not_cancellable", message: "Booking is not active" }, 409);
  }

  if (!isBeforeCutoff(row.sessionStartsAt, new Date())) {
    return json({ error: "inside_cutoff" }, 409);
  }

  // Count-based: the allotment query (get-child-membership.ts) only counts
  // "confirmed"/"no_show" rows, so this flag is determined by the booking's
  // payment method alone — independent of whatever processCancelRefund does.
  const creditFreed = row.booking.paymentMethod === "member_allotment";

  const result = await processCancelRefund(row.booking.id, { reason: "user_request" });
  if (!result.ok) {
    // Should be rare — our own active-status check above already filters
    // this out, save for a race with a concurrent cancel between the SELECT
    // and here.
    return json({ error: result.reason ?? "Cancellation failed" }, 409);
  }

  return json({ cancelled: true, creditFreed, refunded: result.refunded }, 200);
};
