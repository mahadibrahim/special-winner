import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stripeEvents } from "@/lib/db/schema/stripe-events";
import { handleDropInCheckoutComplete } from "./handle-dropin-checkout-complete";
import { handleFieldRentalCheckoutComplete } from "./handle-field-rental-checkout-complete";
import { handleDropInWalkUpPayment } from "./handle-dropin-walkup-payment";
import { handleDropinWalkinPayment } from "./handle-dropin-walkin-payment";
import { handleDropInClaimPayment } from "./handle-dropin-claim-payment";
import { handleDropInBookingPayment } from "./handle-dropin-booking-payment";
import { handleFieldRentalWalkUpPayment } from "./handle-field-rental-walkup-payment";
import { handlePaymentFailed } from "./handle-payment-failed";
import { handleRegistrationPaymentSucceeded } from "./handle-registration-payment-succeeded";
import { handleTeamDepositSucceeded } from "./handle-team-deposit-succeeded";
import { finalizeTeamDeposit } from "@/lib/registrations/finalize-team-deposit";
import { handleChargeRefunded } from "./handle-charge-refunded";
import { handleChargeDispute } from "./handle-charge-dispute";
import { handleMerchOrderCompleted } from "@/lib/merch/fulfillment";
import {
  handleCheckoutSessionCompleted as handleMembershipCheckoutComplete,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
} from "@/lib/memberships/webhook-handlers";
import {
  handleDropCheckoutCompleted,
  handleDropSubscriptionUpdated,
  handleDropSubscriptionDeleted,
  handleDropInvoicePaymentFailed,
} from "@/lib/drop-league/webhook-handlers";
import { captureWebhookOutcome } from "@/lib/observability/webhook-telemetry";

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
 *   2. Drop-in bookings — inline Payment Element (PaymentIntents), finalized
 *      by `payment_intent.succeeded` with metadata.type
 *      "dropin_booking_embedded". The legacy hosted-Checkout path
 *      (`checkout.session.completed`, metadata.type "dropin_booking") stays
 *      routed for in-flight sessions. Field rentals remain hosted Checkout
 *      (metadata.type "field_rental"). Card only.
 *
 * Walk-up / kiosk flows add more `payment_intent.succeeded` variants
 * (dropin_walkin, dropin_booking_walk_up, field_rental_walk_up).
 *
 *   3. Memberships (recurring) — Stripe Checkout in subscription mode.
 *      Created on the PLATFORM account (the second brand shares one Stripe
 *      account, no Connect), so their lifecycle events land HERE, not on the
 *      Connect endpoint. `checkout.session.completed` (metadata.type
 *      "membership_subscription") inserts the row; `customer.subscription.*`
 *      and `invoice.payment_failed` keep its status in sync.
 *
 * Consequence: the Stripe webhook endpoint MUST stay subscribed to BOTH
 * `payment_intent.succeeded` AND `checkout.session.completed` — drop one
 * and half the payment system silently stops recording.
 *
 * Full event-subscription list the prod webhook must carry:
 *   - checkout.session.completed
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed
 *   - charge.refunded
 *   - charge.dispute.created
 *   - charge.dispute.funds_withdrawn
 *   - charge.dispute.closed
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_failed
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
      } else if (session.metadata?.type === "membership_subscription") {
        // Membership subscriptions settle on the platform account (no Connect
        // for the second brand), so their checkout.session.completed lands
        // HERE, not on the Connect endpoint. The shared handler is idempotent
        // and re-checks mode + metadata.type before inserting the row.
        await handleMembershipCheckoutComplete(session);
        console.log(
          `[stripe webhook] checkout.session.completed (membership) → sub=${
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? "(none)"
          }`,
        );
      } else if (session.metadata?.type === "drop_subscription") {
        // Drop-league recurring subscriptions. Same platform account as
        // memberships — no Connect. Handler is idempotent (UPSERT on
        // dropPlayerId); currentPeriodEnd is set by the subsequent
        // customer.subscription.updated event.
        await handleDropCheckoutCompleted(session);
        console.log(
          `[stripe webhook] checkout.session.completed (drop_subscription) → sub=${
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? "(none)"
          }`,
        );
      } else if (session.metadata?.type === "merch_order") {
        const result = await handleMerchOrderCompleted(session as any);
        console.log(
          `[stripe webhook] checkout.session.completed (merch_order) → ${result.status}`,
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

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Membership subscription lifecycle on the platform account. Idempotent;
      // keyed on stripeSubscriptionId. (Connected-account subscriptions, if any
      // ever exist, are handled on the Connect endpoint with the same handler.)
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(sub);
      console.log(`[stripe webhook] ${event.type} (membership) → ${sub.id}`);
      // Drop-league subscriptions share the same platform account and the same
      // event stream. handleDropSubscriptionUpdated no-ops when no matching
      // drop_subscriptions row exists, so this is safe to fan-out always.
      await handleDropSubscriptionUpdated(sub);
      console.log(`[stripe webhook] ${event.type} (drop) → ${sub.id}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(sub);
      console.log(`[stripe webhook] customer.subscription.deleted (membership) → ${sub.id}`);
      await handleDropSubscriptionDeleted(sub);
      console.log(`[stripe webhook] customer.subscription.deleted (drop) → ${sub.id}`);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePaymentFailed(invoice);
      console.log(`[stripe webhook] invoice.payment_failed (membership) → ${invoice.id}`);
      await handleDropInvoicePaymentFailed(invoice);
      console.log(`[stripe webhook] invoice.payment_failed (drop) → ${invoice.id}`);
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      if (paymentIntent.metadata?.type === "dropin_booking_embedded") {
        // Inline Payment Element drop-in booking — inserts the booking row
        // via the same shared fulfillment core as the legacy hosted
        // Checkout flow (see handle-dropin-booking-payment.ts).
        const result = await handleDropInBookingPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (dropin embedded booking) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.type === "dropin_walkin") {
        const result = await handleDropinWalkinPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (dropin walkin) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.type === "dropin_claim_payment") {
        // Paying to confirm a promoted overflow booking — flips the existing
        // pending_claim row to confirmed (see handle-dropin-claim-payment.ts).
        // The corresponding checkout.session.completed event carries
        // metadata.type "dropin_claim_payment" too and is deliberately
        // ignored by the branch above (no row insert — the row exists).
        const result = await handleDropInClaimPayment(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (dropin claim payment) → ${result.status}`,
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
      } else if (paymentIntent.metadata?.kind === "team_deposit") {
        const result = await handleTeamDepositSucceeded(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (team deposit) → ${result.status}`,
          result,
        );
      } else if (paymentIntent.metadata?.kind === "team_deposit_pending") {
        // Deferred-account team reserve: the browser finalize call is the happy
        // path; this is the idempotent backstop that creates the account + team
        // (minus a session) if that call never landed.
        const result = await finalizeTeamDeposit(paymentIntent);
        console.log(
          `[stripe webhook] payment_intent.succeeded (team deposit pending) → created=${result.created} team=${result.teamRegistrationId}`,
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

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const result = await handleChargeRefunded(charge);
      console.log(`[stripe webhook] charge.refunded → ${result.status}`, result);
      break;
    }

    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const result = await handleChargeDispute(dispute, event.type);
      console.log(`[stripe webhook] ${event.type} → ${result.status}`, result);
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
    // Telemetry: deduped delivery. Fire-and-forget — never blocks the
    // webhook on PostHog availability.
    void captureWebhookOutcome({
      webhook: "stripe",
      outcome: "deduped",
      eventType: event.type,
      eventId: event.id,
    });
    return { status: "deduped" };
  }

  try {
    await dispatch(event);
  } catch (err) {
    await releaseStripeEvent(event.id);
    throw err;
  }

  // Telemetry: successful processing — dashboards need positive signal
  // to distinguish "all quiet" from "Stripe stopped delivering."
  void captureWebhookOutcome({
    webhook: "stripe",
    outcome: "processed",
    eventType: event.type,
    eventId: event.id,
  });
  return { status: "processed" };
}
