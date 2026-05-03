/**
 * Stripe client + checkout session helper.
 *
 * Idempotency keys are passed to every Stripe write so Netlify Function
 * retries (and double-fired client requests) don't double-charge.
 *
 * Key conventions used across the codebase:
 *   - checkout session create:  `${registrationId}:checkout:${amountCents}`
 *   - connect checkout create:  `${registrationId}:connect-checkout:${amountCents}`
 *   - refund:                   `${registrationId}:refund:${amountCents}`
 *   - connect account create:   `${organizationId}:connect-account`
 *   - connect payment intent:   `${registrationId}:connect-pi:${amountCents}`
 *
 * The amountCents suffix matters because partial-pay flows can legitimately
 * charge the same registration multiple times for different amounts; using
 * a static `${id}:checkout` would make the second charge fail with the
 * Stripe duplicate-idempotency-key error.
 */
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
  extraMetadata,
}: {
  registrationId: string;
  seasonName: string;
  playerName: string;
  amountCents: number;
  customerEmail: string;
  extraMetadata?: Record<string, string>;
}): Promise<{ id: string; clientSecret: string } | null> {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "custom",
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
        customer_email: customerEmail,
        metadata: {
          registrationId,
          type: "registration_payment",
          ...(extraMetadata ?? {}),
        },
      },
      {
        idempotencyKey: `${registrationId}:checkout:${amountCents}`,
      },
    );

    if (!session.client_secret) {
      console.error("Stripe session returned without client_secret");
      return null;
    }

    return { id: session.id, clientSecret: session.client_secret };
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
