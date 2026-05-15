/**
 * Refund + cancel a field rental. Issues a Stripe refund when the rental
 * was paid online/card-present, then marks the row cancelled. Cash/comp
 * rentals are cancelled without a Stripe call.
 *
 * Returns the updated row or an error string. Idempotency-keyed on the
 * rental id + amount per the repo's Stripe key convention. The body runs
 * inside a transaction with `SELECT ... FOR UPDATE` so concurrent cancels
 * for the same rental serialize on the row lock.
 */
import { and, ne, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { stripe } from "@/lib/stripe/client";

export async function refundFieldRental(
  rentalId: string,
  reason: "user_request" | "admin_override" | "venue_unavailable",
): Promise<{ ok: true; rental: FieldRental } | { ok: false; error: string }> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [rental] = await tx
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.id, rentalId))
      .for("update");
    if (!rental) return { ok: false, error: "Rental not found" };
    if (rental.status === "cancelled") {
      return { ok: false, error: "Rental already cancelled" };
    }

    const needsStripeRefund =
      rental.paymentStatus === "paid" &&
      rental.amountPaidCents > 0 &&
      rental.stripePaymentIntentId != null &&
      (rental.paymentMethod === "card_online" ||
        rental.paymentMethod === "card_present");

    let stripeRefundId: string | null = rental.stripeRefundId;
    if (needsStripeRefund) {
      if (!stripe) return { ok: false, error: "Stripe not configured" };
      try {
        const refund = await stripe.refunds.create(
          { payment_intent: rental.stripePaymentIntentId! },
          {
            idempotencyKey: `${rental.id}:refund:${rental.amountPaidCents}`,
          },
        );
        stripeRefundId = refund.id;
      } catch (err) {
        console.error("[rentals] refund failed", err);
        return { ok: false, error: "Refund failed; rental not cancelled" };
      }
    }

    const [updated] = await tx
      .update(fieldRentals)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason,
        paymentStatus: needsStripeRefund ? "refunded" : rental.paymentStatus,
        stripeRefundId,
        updatedAt: new Date(),
      })
      .where(and(eq(fieldRentals.id, rentalId), ne(fieldRentals.status, "cancelled")))
      .returning();
    if (!updated) {
      return { ok: false, error: "Rental already cancelled" };
    }
    return { ok: true, rental: updated };
  });
}
