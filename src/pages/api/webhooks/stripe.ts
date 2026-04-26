import type { APIRoute } from "astro";
import { verifyWebhookSignature } from "@/lib/stripe/client";
import { handleCheckoutComplete } from "@/lib/stripe/handle-checkout-complete";
import { handlePaymentFailed } from "@/lib/stripe/handle-payment-failed";
import { getDb } from "@/lib/db";
import { stripeEvents } from "@/lib/db/schema";
import type Stripe from "stripe";

/**
 * Try to claim this Stripe event id in the stripe_events ledger.
 * Returns true if this is the first time we've seen the event (process it),
 * false if it was already processed (short-circuit).
 *
 * This is the canonical webhook idempotency mechanism. Per-handler dedupe
 * (e.g. handle-checkout-complete looking up payments by session id) is a
 * belt-and-braces secondary check.
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

export const POST: APIRoute = async ({ request }) => {
  try {
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const event = verifyWebhookSignature(payload, signature, webhookSecret);
    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const isFirstDelivery = await claimStripeEvent(event);
    if (!isFirstDelivery) {
      console.log(
        `[stripe webhook] duplicate delivery for event ${event.id} (${event.type}), skipping`,
      );
      return new Response(JSON.stringify({ received: true, deduped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleCheckoutComplete(session);
        console.log(`[stripe webhook] checkout.session.completed → ${result.status}`, result);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const result = await handlePaymentFailed(paymentIntent);
        console.log(`[stripe webhook] payment_intent.payment_failed → ${result.status}`, result);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    try {
      const { getPostHogServer } = await import("@/lib/posthog-server");
      // The `event` variable is scoped to the outer try and not visible
      // here. The webhook signature verification + event metadata that
      // landed in the event-handler branches above already log on their
      // own; this catch is for anything that escapes those.
      getPostHogServer().captureException(error, "stripe-webhook");
    } catch {
      // Never fail a webhook because of analytics.
    }
    return new Response(JSON.stringify({ error: "Webhook handler failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
