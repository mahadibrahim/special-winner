/**
 * Stripe webhook handler for drop-in walk-in PaymentIntent success.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_walkin"`.
 *
 * Flips the pending_claim walk-in booking to `confirmed`. Cancelled-guard
 * protects against late-arriving webhooks after a refund/cancel.
 *
 * The booking row is created by POST /api/kiosk/[venueSlug]/walkin/start
 * in `pending_claim` status; the PaymentIntent is attached by
 * POST /api/kiosk/[venueSlug]/walkin/payment. This handler completes
 * the flow once Stripe confirms the charge.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";

export async function handleDropinWalkinPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
> {
  const bookingId = paymentIntent.metadata?.booking_id;
  if (!bookingId) {
    return { status: "skipped", reason: "missing booking_id metadata" };
  }
  const paidCents = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const db = getDb();

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .for("update");
    if (!row) {
      return { status: "skipped", reason: `booking ${bookingId} not found` };
    }
    if (row.status === "cancelled") {
      return {
        status: "skipped",
        reason: `booking ${bookingId} already cancelled — late webhook`,
      };
    }
    if (row.status === "confirmed") {
      return { status: "skipped", reason: `booking ${bookingId} already confirmed` };
    }
    if (row.status !== "pending_claim") {
      return {
        status: "skipped",
        reason: `booking ${bookingId} in unexpected status ${row.status}`,
      };
    }

    await tx
      .update(dropInBookings)
      .set({
        status: "confirmed",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntent.id,
        promotionExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, bookingId));

    // TODO(check-in): fire-and-forget walk-in confirmation email/SMS once
    // a self-serve confirmation messaging module exists.

    return { status: "processed", bookingId, paidCents };
  });
}
