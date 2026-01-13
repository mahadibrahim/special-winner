import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { registrations, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/stripe/client";
import type Stripe from "stripe";

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get raw body and signature
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify webhook signature
    const event = verifyWebhookSignature(payload, signature, webhookSecret);
    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment succeeded:", paymentIntent.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment failed:", paymentIntent.id);
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
    return new Response(JSON.stringify({ error: "Webhook handler failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  if (!db) return;

  const registrationId = session.metadata?.registrationId;
  const paymentType = session.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    console.log("Not a registration payment, skipping");
    return;
  }

  // Get the registration
  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    console.error("Registration not found:", registrationId);
    return;
  }

  // Calculate payment amount
  const amountPaid = session.amount_total || 0;
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;

  // Determine payment type based on registration type
  const paymentTypeValue = registration.registrationType === "deposit" ? "deposit" : "full";

  // Update registration
  await db
    .update(registrations)
    .set({
      status: "confirmed",
      paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
      amountPaidCents: newAmountPaid,
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registrationId));

  // Create payment record
  await db.insert(payments).values({
    registrationId,
    userId: registration.registeredByUserId,
    amountCents: amountPaid,
    paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
    status: "succeeded",
    stripePaymentIntentId: session.payment_intent as string,
    metadata: {
      customerEmail: session.customer_email,
      stripeCheckoutSessionId: session.id,
    },
  });

  console.log(`Payment processed for registration ${registrationId}: $${amountPaid / 100}`);
}
