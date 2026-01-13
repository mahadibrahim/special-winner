import Stripe from "stripe";

// Initialize Stripe with secret key
// In production, this should come from environment variables
const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      typescript: true,
    })
  : null;

// Helper to check if Stripe is configured
export function isStripeConfigured(): boolean {
  return stripe !== null;
}

// Create a checkout session for registration payment
export async function createCheckoutSession({
  registrationId,
  seasonName,
  playerName,
  amountCents,
  customerEmail,
  successUrl,
  cancelUrl,
}: {
  registrationId: string;
  seasonName: string;
  playerName: string;
  amountCents: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: seasonName,
              description: `Registration for ${playerName}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      metadata: {
        registrationId,
        type: "registration_payment",
      },
    });

    return session;
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    throw error;
  }
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
): Stripe.Event | null {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return null;
  }
}
