/**
 * POST /api/classes/bookings/:id/cancel
 *
 * Customer-facing cancel for a CHILD class booking (member-allotment or
 * trial — both rows inserted by `createChildClassBooking`, and the paid
 * make-up rows inserted by the webhook fulfillment core also flow through
 * here since they share the same `drop_in_bookings` table).
 *
 * Cutoff policy: a window before the session start, applied UNIFORMLY to
 * member and trial bookings alike (see `isBeforeCutoff`'s doc comment in
 * src/lib/classes/book-child.ts for why trial gets no special-casing). The
 * window length is the org's OWN `dropInRateCard.cancelWindowHours`
 * (admin-editable, DB default 24, falls back to 24 here too if the org has
 * no rate card row) — NOT a hardcoded 24. This must be the exact same
 * number `processCancelRefund` uses for its own window check below, or a
 * cancel between 24h and an admin-raised window would pass this gate but
 * silently forfeit the refund (customer cancels "in time" per this
 * endpoint, gets `refunded: false` from the delegate). Outside the window
 * → cancelled. Inside the window → 409 `inside_cutoff`, no cancellation at
 * all — this is a HARDER gate than `processCancelRefund`'s own window
 * check (that one only decides refund-or-forfeit; it never blocks the
 * cancel itself). Ownership + org-scope + active-status + the cutoff are
 * all enforced here, BEFORE delegating the actual cancellation to
 * `processCancelRefund`.
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
import { dropInBookings, dropInRateCard, dropInSessions } from "@/lib/db/schema/drop-in";
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

  // rateCard (org-scoped, same query shape the dropin endpoints use — see
  // bookings/index.ts) and the booking join are independent reads; fetch
  // concurrently.
  const [rateCardRows, bookingRows] = await Promise.all([
    db
      .select({ cancelWindowHours: dropInRateCard.cancelWindowHours })
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, locals.organization.id))
      .limit(1),
    // Org-scoped via the session join — a booking id from another org (or a
    // nonexistent one) 404s rather than leaking existence.
    db
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
      .limit(1),
  ]);
  // No rate card row for the org → fall back to the DB column's own
  // default (24) rather than blocking the cancel outright.
  const cancelWindowHours = rateCardRows[0]?.cancelWindowHours ?? 24;
  const [row] = bookingRows;
  if (!row) return json({ error: "Booking not found" }, 404);

  if (row.booking.userId !== locals.user.id) {
    return json({ error: "Not your booking" }, 403);
  }

  if (!(ACTIVE_BOOKING_STATUS_LIST as readonly string[]).includes(row.booking.status)) {
    return json({ error: "not_cancellable", message: "Booking is not active" }, 409);
  }

  if (!isBeforeCutoff(row.sessionStartsAt, new Date(), cancelWindowHours)) {
    return json({ error: "inside_cutoff" }, 409);
  }

  // Count-based on BOTH ledgers: the allotment query
  // (get-child-membership.ts) and the class-credit balance
  // (src/lib/classes/credits.ts) each derive "used" by counting
  // seat-holding booking rows, so flipping this row's status to `cancelled`
  // IS the credit-free operation for either. Determined by the booking's
  // payment method alone — independent of whatever processCancelRefund does.
  const creditFreed =
    row.booking.paymentMethod === "member_allotment" ||
    row.booking.paymentMethod === "pack_credit";

  const result = await processCancelRefund(row.booking.id, { reason: "user_request" });
  if (!result.ok) {
    // Should be rare — our own active-status check above already filters
    // this out, save for a race with a concurrent cancel between the SELECT
    // and here.
    return json({ error: result.reason ?? "Cancellation failed" }, 409);
  }

  return json({ cancelled: true, creditFreed, refunded: result.refunded }, 200);
};
