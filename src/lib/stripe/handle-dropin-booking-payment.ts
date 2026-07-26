/**
 * Stripe webhook handler for embedded (inline Payment Element) drop-in
 * booking payments.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_booking_embedded"`.
 *
 * The PaymentIntent is minted by `createDropInPaymentIntent`
 * (src/lib/dropin/create-checkout.ts) on the customer's Pay click and
 * carries the full fulfillment metadata contract. This adapter normalizes
 * the PaymentIntent into the shared `fulfillDropInBookingPayment` core in
 * handle-dropin-checkout-complete.ts — the SAME code path the legacy
 * hosted-Checkout handler uses, so capacity gating, overflow refunds,
 * duplicate-user resolution, confirmation dispatch, and ad conversions
 * behave identically regardless of which surface took the payment.
 *
 * Idempotency: the stripe_events ledger dedupes re-deliveries upstream;
 * the shared core's PaymentIntent-id row lookup is the belt-and-braces
 * secondary check (identical to the hosted flow).
 */
import type Stripe from "stripe";
import { fulfillDropInBookingPayment } from "./handle-dropin-checkout-complete";

export async function handleDropInBookingPayment(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
  | { status: "overflow"; bookingId: string }
> {
  return fulfillDropInBookingPayment({
    metadata: paymentIntent.metadata ?? null,
    paymentIntentId: paymentIntent.id,
    amountTotalCents:
      paymentIntent.amount_received ?? paymentIntent.amount ?? 0,
    // receipt_email is set by createDropInPaymentIntent from the booking
    // user's email — the same identity the hosted flow's customer_email
    // carried into server-side ad conversions.
    customerEmail: paymentIntent.receipt_email ?? null,
    fallbackEventId: paymentIntent.id,
  });
}
