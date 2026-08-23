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
 * Outside the window (>= 24h before start) → cancelled, seat/credit freed.
 * Inside the window (< 24h before start) → 409, no cancellation.
 *
 * `creditFreed` reports whether a member-allotment credit was given back —
 * the allotment is COUNT-based (see get-child-membership.ts), so flipping
 * this row's status to `cancelled` IS the credit-free operation; there is
 * no separate counter to decrement.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import {
  ACTIVE_BOOKING_STATUS_LIST,
  ACTIVE_BOOKING_STATUSES,
  isBeforeCutoff,
} from "@/lib/classes/book-child";

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

  await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: "user_request",
      updatedAt: new Date(),
    })
    .where(
      and(eq(dropInBookings.id, row.booking.id), ACTIVE_BOOKING_STATUSES),
    );

  const creditFreed = row.booking.paymentMethod === "member_allotment";
  return json({ cancelled: true, creditFreed }, 200);
};
