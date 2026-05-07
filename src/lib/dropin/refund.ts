/**
 * Drop-in cancellation + refund.
 *
 * Policy:
 *   - Booking is cancelled outside the org's `cancelWindowHours` (default 24)
 *     before session start → user gets a refund.
 *   - Booking is cancelled inside the window → forfeit (no refund).
 *   - Admin override → refund regardless of window.
 *
 * For paid bookings (`stripePaymentIntentId` set), we hit Stripe Refunds.
 * For member bookings (no PI, paid via allotment/unlimited), we'd
 * increment the membership counter — currently a no-op until the
 * memberships schema lands.
 *
 * After successful cancellation we always run `promoteNextWaitlister` so
 * the freed seat reaches the next person in line.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInBookings,
  dropInSessions,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { stripe } from "@/lib/stripe/client";
import { promoteNextWaitlister } from "./promotion";

export interface CancelRefundResult {
  ok: boolean;
  refunded: boolean;
  reason?: string;
  insideWindow?: boolean;
  promotedNextBookingId?: string;
}

export async function processCancelRefund(
  bookingId: string,
  options: { adminOverride?: boolean; reason?: string } = {},
): Promise<CancelRefundResult> {
  const db = getDb();

  const [booking] = await db
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.id, bookingId))
    .limit(1);
  if (!booking) return { ok: false, refunded: false, reason: "Not found" };

  if (booking.status === "cancelled") {
    return { ok: false, refunded: false, reason: "Already cancelled" };
  }

  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, booking.sessionId))
    .limit(1);
  if (!session) {
    return { ok: false, refunded: false, reason: "Session not found" };
  }

  const [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, session.organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const hoursUntilStart =
    (new Date(session.startsAt).getTime() - Date.now()) / 3_600_000;
  const insideWindow = hoursUntilStart < cancelWindowHours;

  const shouldRefund = !insideWindow || options.adminOverride === true;

  let refunded = false;
  if (
    shouldRefund &&
    booking.amountPaidCents > 0 &&
    booking.stripePaymentIntentId &&
    stripe
  ) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripePaymentIntentId,
      });
      await db
        .update(dropInBookings)
        .set({ stripeRefundId: refund.id })
        .where(eq(dropInBookings.id, bookingId));
      refunded = true;
    } catch (err) {
      console.error("[dropin refund] Stripe refund failed", err);
      // Continue — we still want to cancel the booking; refund retry is a
      // separate cleanup path.
    }
  }

  // TODO: when memberships schema lands, restore the allotment counter
  // here for paymentMethod === "member_allotment" cases.

  await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: options.adminOverride
        ? "admin_override"
        : "user_request",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dropInBookings.id, bookingId));

  let promotedNextBookingId: string | undefined;
  try {
    const promoted = await promoteNextWaitlister(booking.sessionId);
    if (promoted.promoted) promotedNextBookingId = promoted.bookingId;
  } catch (err) {
    console.error("[dropin refund] promote-next failed", err);
  }

  return {
    ok: true,
    refunded,
    insideWindow,
    promotedNextBookingId,
  };
}
