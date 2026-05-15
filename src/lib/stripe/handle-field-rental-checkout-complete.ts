/**
 * Stripe webhook handler for field-rental checkout completion.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "field_rental"`.
 *
 * Flips the `pending_payment` hold row to `confirmed` and records payment.
 * Idempotent: if the row is already `confirmed`, skip. Mirrors
 * src/lib/stripe/handle-dropin-checkout-complete.ts.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";

export async function handleFieldRentalCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; rentalId: string; paidCents: number }
> {
  const rentalId = session.metadata?.rental_id;
  if (!rentalId) {
    return { status: "skipped", reason: "missing rental_id metadata" };
  }

  const db = getDb();
  const paymentIntentId = (session.payment_intent as string) ?? null;
  const paidCents = session.amount_total ?? 0;

  // Idempotency design note:
  // This handler updates an EXISTING row (pending_payment → confirmed). It does NOT
  // INSERT a new row, so the duplicate-INSERT risk that the dropin handler guards
  // against with a pre-check on `stripePaymentIntentId` does not apply here.
  //
  // The canonical dedup layer is the `stripe_events` ledger upstream (the webhook
  // dispatcher skips already-seen event IDs before reaching this function). The
  // belt-and-braces secondary check here is:
  //   1. `SELECT … FOR UPDATE` — serializes concurrent deliveries of the same event;
  //      the second concurrent call blocks until the first commits, then sees the
  //      updated status and bails out via the guard below.
  //   2. `status !== "pending_payment"` guard — if the row is already `confirmed`
  //      (or any other terminal status), the handler returns `skipped` immediately.
  //
  // Together these two checks fully cover double-delivery without needing an explicit
  // `stripePaymentIntentId` pre-check, because we are never creating a new row.
  return await db.transaction(async (tx) => {
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
        stripePaymentIntentId: paymentIntentId,
        paymentExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId));

    // TODO(rentals): fire-and-forget a rental confirmation email/SMS here once a rental
    // messaging module exists (mirrors dispatchBookingConfirmation in the drop-in flow).
    // Tracked as a follow-up — the spec calls for it but no rental messaging module is
    // built yet.
    return { status: "processed", rentalId, paidCents };
  });
}
