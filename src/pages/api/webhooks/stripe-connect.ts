import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { stripe, updateOrganizationStripeStatus } from "@/lib/stripe/connect";
import { getPostHogServer, flushPostHog } from "@/lib/posthog-server";
import {
  captureWebhookException,
  captureWebhookOutcome,
} from "@/lib/observability/webhook-telemetry";
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
} from "@/lib/memberships/webhook-handlers";

// `import.meta.env` is build-time inlined; `process.env` fallback makes this a
// runtime read so a rotated/late-set Netlify secret applies without a rebuild.
const STRIPE_CONNECT_WEBHOOK_SECRET =
  import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET ??
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
  if (!stripe) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature || !STRIPE_CONNECT_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Missing signature or webhook secret" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Best-effort event metadata for telemetry — both stay null if
  // constructEvent throws, in which case the helper falls back to "(unknown)".
  let event: Stripe.Event | null = null;

  try {
    const body = await request.text();

    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_CONNECT_WEBHOOK_SECRET
    );

    console.log(`Received Stripe Connect webhook: ${event.type}`);

    switch (event.type) {
      case "account.updated": {
        // Stripe's base Event type leaves data.object untyped; narrow it
        // per event.type.
        const account = event.data.object as Stripe.Account;
        const accountId = account.id;

        // Determine status based on account properties
        let status: "pending" | "active" | "restricted" | "disabled" = "pending";

        if (account.charges_enabled && account.payouts_enabled) {
          status = "active";
        } else if (account.details_submitted) {
          status = "restricted";
        } else if (
          account.requirements?.disabled_reason ||
          account.requirements?.past_due?.length
        ) {
          status = "disabled";
        }

        await updateOrganizationStripeStatus(accountId, status);

        if (status === "active") {
          const posthog = getPostHogServer();
          posthog.capture({ distinctId: accountId, event: "stripe_connect_account_activated", properties: { stripe_account_id: accountId } });
        }

        console.log(`Updated organization Stripe status: ${accountId} -> ${status}`);
        break;
      }

      case "account.application.authorized": {
        // Account has authorized the platform
        const application = event.data.object as Stripe.Application;
        console.log(`Account authorized: ${application.id}`);
        break;
      }

      case "account.application.deauthorized": {
        // Account has disconnected from the platform
        const application = event.data.object as Stripe.Application;
        await updateOrganizationStripeStatus(application.id, "disabled");
        console.log(`Account deauthorized: ${application.id}`);
        break;
      }

      case "capability.updated": {
        // A capability on a connected account was updated
        const capability = event.data.object as Stripe.Capability;
        console.log(`Capability updated: ${capability.id} -> ${capability.status}`);
        break;
      }

      case "payout.paid": {
        // A payout was sent to a connected account
        const payout = event.data.object as Stripe.Payout;
        console.log(`Payout completed: ${payout.id} for ${payout.amount / 100} ${payout.currency}`);
        break;
      }

      case "payout.failed": {
        // A payout failed
        const payout = event.data.object as Stripe.Payout;
        console.error(`Payout failed: ${payout.id}`, payout.failure_message);
        break;
      }

      case "checkout.session.completed": {
        // Membership subscriptions — Aspire's payment Checkout sessions
        // land on the primary `/api/webhooks/stripe` endpoint, not here.
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled Stripe Connect event: ${event.type}`);
        void captureWebhookOutcome({
          webhook: "stripe-connect",
          outcome: "unhandled",
          eventType: event.type,
          eventId: event.id,
        });
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
    }

    void captureWebhookOutcome({
      webhook: "stripe-connect",
      outcome: "processed",
      eventType: event.type,
      eventId: event.id,
    });
    // Deliver telemetry before returning — Netlify freezes the instance
    // after the response, which can drop in-flight capture requests.
    await flushPostHog();
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing Stripe Connect webhook:", error);
    void captureWebhookException(error, {
      webhook: "stripe-connect",
      eventType: event?.type,
      eventId: event?.id,
    });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Webhook processing failed",
      }),
      {
        // 500 — a thrown error inside the try (post-signature-verify) is
        // an internal failure, not a bad request from Stripe. Returning
        // 5xx tells Stripe to retry the delivery with exponential backoff
        // (up to ~3 days), so a transient blip self-heals instead of
        // permanently dropping the event. Matches the main
        // /api/webhooks/stripe endpoint.
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
