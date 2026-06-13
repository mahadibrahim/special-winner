import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { verifyWebhookSignature } from "@/lib/stripe/client";
import { handleStripeEvent } from "@/lib/stripe/handle-stripe-event";
import { captureWebhookException } from "@/lib/observability/webhook-telemetry";

/**
 * Stripe webhook endpoint.
 *
 * Verifies the signature, then hands the event to `handleStripeEvent`,
 * which owns idempotency (the stripe_events ledger), dispatch, and the
 * `stripe_webhook_outcome` PostHog telemetry. A thrown handler error
 * propagates here as a 500 so Stripe retries the delivery —
 * `handleStripeEvent` has already released the ledger claim so the retry
 * is not short-circuited as a duplicate.
 *
 * Observability:
 *   - Exceptions land in PostHog via `captureWebhookException` so the
 *     PostHog UI can alert on `stripe_webhook_exception`.
 *   - Successful + deduped outcomes are recorded by `handleStripeEvent`
 *     as `stripe_webhook_outcome` so dashboards distinguish "all good"
 *     from "Stripe stopped delivering."
 *
 * See docs/ops/webhook-monitoring.md for the founder-side alert setup.
 */
export const POST: APIRoute = async ({ request }) => {
  // Best-effort event metadata for telemetry — both are still unknown if
  // signature verification fails, in which case the helper falls back to
  // "(unknown)".
  let event: Stripe.Event | null = null;

  try {
    // `import.meta.env` is build-time inlined; `process.env` fallback makes this
    // a runtime read so a rotated/late-set Netlify secret applies without a rebuild.
    const webhookSecret =
      import.meta.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      return new Response(
        JSON.stringify({ error: "Webhook not configured" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    event = verifyWebhookSignature(payload, signature, webhookSecret);
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
    void captureWebhookException(error, {
      webhook: "stripe",
      eventType: event?.type,
      eventId: event?.id,
    });
    return new Response(JSON.stringify({ error: "Webhook handler failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
