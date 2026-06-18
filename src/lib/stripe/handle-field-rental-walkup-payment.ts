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
import { dispatchRentalConfirmation } from "@/lib/rentals/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";

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

  // Captured inside the tx for the post-commit revenue event.
  let renterUserId: string | null = null;

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
    renterUserId = rental.renterUserId;
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

    // Rental confirmation (email-preferred, SMS fallback). Awaited so the send
    // completes before the serverless function freezes; logged-but-not-thrown
    // on failure so it can't poison the webhook.
    await awaitDispatch(
      "rental walk-up confirmation",
      () => dispatchRentalConfirmation(result.rentalId),
      { rentalId: result.rentalId },
    );

    // Revenue analytics only — at-facility Terminal sale, no ad click, so not
    // reported to GA4 Ads / Meta as a conversion (PostHog reporting only).
    if (renterUserId) {
      capturePaymentCompleted({
        distinctId: renterUserId,
        kind: "field_rental",
        amountCents: result.paidCents,
        brand: normalizeBrand(paymentIntent.metadata?.brand),
        metadata: { rental_id: result.rentalId, source: "walk_up" },
      });
    }
  }
  return result;
}
