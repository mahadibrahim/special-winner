import type { APIRoute } from "astro";
import { verifyWebhookSignature } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/stripe/handle-stripe-event";

/**
 * Stripe webhook endpoint.
 *
 * Verifies the signature, then hands the event to `handleStripeEvent`,
 * which owns idempotency (the stripe_events ledger) and dispatch. A thrown
 * handler error propagates here as a 500 so Stripe retries the delivery —
 * `handleStripeEvent` has already released the ledger claim so the retry
 * is not short-circuited as a duplicate.
 */
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

    await handleStripeEvent(event);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    try {
      const { getPostHogServer } = await import("@/lib/posthog-server");
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
