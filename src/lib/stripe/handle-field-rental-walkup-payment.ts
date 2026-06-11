/**
 * Stripe webhook handler for field-rental card-present (Terminal) payments.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "field_rental_walk_up"`.
 *
 * Flips the `pending_payment` hold to `confirmed`. Mirrors
 * src/lib/stripe/handle-field-rental-checkout-complete.ts. The status
 * checks include a `cancelled` short-circuit so a late Terminal success
 * after a refund/cancel doesn't accidentally flip the row back.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { syncRentalBlock } from "@/lib/scheduling/sync";

export async function handleFieldRentalWalkUpPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; rentalId: string; paidCents: number }
> {
  const rentalId = paymentIntent.metadata?.rental_id;
  if (!rentalId) {
    return { status: "skipped", reason: "missing rental_id metadata" };
  }
  const paidCents = paymentIntent.amount_received ?? paymentIntent.amount ?? 0;
  const db = getDb();

  const result:
    | { status: "skipped"; reason: string }
    | { status: "processed"; rentalId: string; paidCents: number } =
    await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!rental) {
      return { status: "skipped", reason: `rental ${rentalId} not found` };
    }
    if (rental.status === "cancelled") {
      return { status: "skipped", reason: `rental ${rentalId} already cancelled — late webhook` };
    }
    if (rental.status === "confirmed") {
      return { status: "skipped", reason: `rental ${rentalId} already confirmed` };
    }
    if (rental.status !== "pending_payment") {
      return {
        status: "skipped",
        reason: `rental ${rentalId} in unexpected status ${rental.status}`,
      };
    }
    await tx
      .update(fieldRentals)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: paidCents,
        stripePaymentIntentId: paymentIntent.id,
        paymentExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId));
    // TODO(rentals): fire-and-forget a rental confirmation email/SMS here
    // once a rental messaging module exists (mirrors dispatchBookingConfirmation
    // in the drop-in flow). Tracked alongside the same TODO in
    // handle-field-rental-checkout-complete.ts.
    return { status: "processed", rentalId, paidCents };
  });

  // Confirmed — refresh the ledger block AFTER the row-lock transaction
  // commits (the pg pool is max:1; opening the ledger's own transaction
  // inside this one deadlocks). Never fail the webhook over a ledger
  // conflict: the payment already happened, and a rare
  // hold-expired-then-resold race must surface on the admin calendar,
  // not poison Stripe deliveries.
  if (result.status === "processed") {
    try {
      await syncRentalBlock(result.rentalId);
    } catch (err) {
      console.error("[rentals] ledger sync after confirm failed", result.rentalId, err);
    }
  }
  return result;
}
