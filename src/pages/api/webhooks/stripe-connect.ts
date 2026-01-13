import type { APIRoute } from "astro";
import { stripe, updateOrganizationStripeStatus } from "@/lib/stripe/connect";

const STRIPE_CONNECT_WEBHOOK_SECRET = import.meta.env.STRIPE_CONNECT_WEBHOOK_SECRET;

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

  try {
    const body = await request.text();

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_CONNECT_WEBHOOK_SECRET
    );

    console.log(`Received Stripe Connect webhook: ${event.type}`);

    switch (event.type) {
      case "account.updated": {
        const account = event.data.object;
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

        console.log(`Updated organization Stripe status: ${accountId} -> ${status}`);
        break;
      }

      case "account.application.authorized": {
        // Account has authorized the platform
        const account = event.data.object;
        console.log(`Account authorized: ${account.id}`);
        break;
      }

      case "account.application.deauthorized": {
        // Account has disconnected from the platform
        const account = event.data.object;
        await updateOrganizationStripeStatus(account.id as string, "disabled");
        console.log(`Account deauthorized: ${account.id}`);
        break;
      }

      case "capability.updated": {
        // A capability on a connected account was updated
        const capability = event.data.object;
        console.log(`Capability updated: ${capability.id} -> ${capability.status}`);
        break;
      }

      case "payout.paid": {
        // A payout was sent to a connected account
        const payout = event.data.object;
        console.log(`Payout completed: ${payout.id} for ${payout.amount / 100} ${payout.currency}`);
        break;
      }

      case "payout.failed": {
        // A payout failed
        const payout = event.data.object;
        console.error(`Payout failed: ${payout.id}`, payout.failure_message);
        break;
      }

      default:
        console.log(`Unhandled Stripe Connect event: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing Stripe Connect webhook:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Webhook processing failed",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
