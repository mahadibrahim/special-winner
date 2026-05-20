import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stripeEvents } from "@/lib/db/schema/stripe-events";
import { handleDropInCheckoutComplete } from "./handle-dropin-checkout-complete";
import { handleFieldRentalCheckoutComplete } from "./handle-field-rental-checkout-complete";
import { handleDropInWalkUpPayment } from "./handle-dropin-walkup-payment";
import { handleDropinWalkinPayment } from "./handle-dropin-walkin-payment";
import { handleFieldRentalWalkUpPayment } from "./handle-field-rental-walkup-payment";
import { handlePaymentFailed } from "./handle-payment-failed";
import { handleRegistrationPaymentSucceeded } from "./handle-registration-payment-succeeded";

/**
 * Try to claim this Stripe event id in the stripe_events ledger.
 * Returns true if this is the first time we've seen the event (process it),
 * false if it was already processed (short-circuit).
 *
 * This is the canonical webhook idempotency mechanism. Per-handler dedupe
 * (e.g. looking up payments by payment-intent id) is a belt-and-braces
 * secondary check.
 */
async function claimStripeEvent(event: Stripe.Event): Promise<boolean> {
  try {
    const inserted = await getDb()
      .insert(stripeEvents)
      .values({
        id: event.id,
        eventId: event.id,
        eventType: event.type,
      })
      .onConflictDoNothing({ target: stripeEvents.eventId })
      .returning({ id: stripeEvents.id });
    return inserted.length > 0;
  } catch (err) {
    // If the ledger insert blew up, fail open (process the event) so we
    // don't silently drop legitimate webhooks. The per-handler dedupe will
    // catch obvious dupes.
    console.error("[stripe webhook] stripe_events insert failed:", err);
    return true;
  }
}

/**
 * Release a previously-claimed event from the ledger. Called when dispatch
 * throws, so the event is not permanently marked processed — Stripe's
 * automatic retry will then reprocess it instead of being short-circuited
 * as a duplicate.
 */
async function releaseStripeEvent(eventId: string): Promise<void> {
  try {
    await getDb().delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  } catch (err) {
    // A failed release is non-fatal: the worst case is a genuinely-failed
    // event staying claimed (the original bug). Surface it loudly.
    console.error("[stripe webhook] stripe_events release failed:", err);
  }
}

/**
 * Route a verified Stripe event to its handler.
 *
 * Aspire runs TWO separate Stripe payment systems, by design (not unified):
 *
 *   1. Registration (leagues / programs) — Stripe PaymentIntents + the
 *      Payment Element. Finalized by `payment_intent.succeeded` with
 *      metadata.type "registration_payment" → handleRegistrationPaymentSucceeded.
 *      Supports bank (ACH) and card.
 *
 *   2. Drop-in bookings + field rentals — Stripe Checkout Sessions
 *      (hosted). Finalized by `checkout.session.completed` with
 *      metadata.type "dropin_booking" / "field_rental". Card only.
 *
 * Walk-up / kiosk flows add more `payment_intent.succeeded` variants
 * (dropin_walkin, dropin_booking_walk_up, field_rental_walk_up).
 *
 * Consequence: the Stripe webhook endpoint MUST stay subscribed to BOTH
 * `payment_intent.succeeded` AND `checkout.session.completed` — drop one
 * and half the payment system silently stops recording.
 */
async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Checkout Sessions are used only by drop-in bookings and field
      // rentals. Registration does NOT use Checkout Sessions (see the
      // payment-systems note above) — any other metadata.type here is
      // unexpected and ignored.
      if (session.metadata?.type === "dropin_booking") {
        const result = await handleDropInCheckoutComplete(session);
        console.log(
          `[stripe webhook] checkout.session.completed (dropin) → ${result.status}`,
          result,
        );
      } else if (session.metadata?.type === "field_rental") {
        const result = await handleFieldRentalCheckoutComplete(session);
        console.log(
          `[stripe webhook] checkout.session.completed (field_rental) → ${result.status}`,
          result,
        );
      } else {
        console.log(
          `[stripe webhook] checkout.session.completed with unrecognized metadata.type=${
            session.metadata?.type ?? "(none)"
          } — ignored`,
        );
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (paymentIntent.metadata?.type === "dropin_walkin") {
        const result = await handleDropinWalkinPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (dropin walkin) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.type === "field_rental_walk_up") {
        const result = await handleFieldRentalWalkUpPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (field_rental walk-up) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.type === "dropin_booking_walk_up") {
        const result = await handleDropInWalkUpPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (dropin walk-up) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.type === "registration_payment") {
        const result = await handleRegistrationPaymentSucceeded(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (registration) → ${result.status}`,
          result,
        );
      } else {
        console.log("Payment succeeded:", paymentIntent.id);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const result = await handlePaymentFailed(paymentIntent);
      console.log(
        `[stripe webhook] payment_intent.payment_failed → ${result.status}`,
        result,
      );
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Process a verified Stripe webhook event with idempotency.
 *
 * The event is claimed in the stripe_events ledger before dispatch. If
 * dispatch throws, the claim is released so the failure is not recorded as
 * a completed event — Stripe's automatic retry then reprocesses it rather
 * than being short-circuited as a duplicate.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
): Promise<{ status: "processed" | "deduped" }> {
  const isFirstDelivery = await claimStripeEvent(event);
  if (!isFirstDelivery) {
    console.log(
      `[stripe webhook] duplicate delivery for event ${event.id} (${event.type}), skipping`,
    );
    return { status: "deduped" };
  }

  try {
    await dispatch(event);
  } catch (err) {
    await releaseStripeEvent(event.id);
    throw err;
  }
  return { status: "processed" };
}
