/**
 * Stripe client + payment intent helper.
 *
 * Idempotency keys are passed to every Stripe write so Netlify Function
 * retries (and double-fired client requests) don't double-charge.
 *
 * Key conventions used across the codebase:
 *   - registration payment intent: `${registrationId}:pi:${amountCents}`
 *   - connect registration PI:     `${registrationId}:connect-pi:${amountCents}`
 *   - refund:                      `${registrationId}:refund:${amountCents}`
 *   - connect account create:      `${organizationId}:connect-account`
 *
 * The amountCents suffix matters because partial-pay flows can legitimately
 * charge the same registration multiple times for different amounts; using
 * a static `${id}:pi` would make the second charge fail with the Stripe
 * duplicate-idempotency-key error.
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

// Create a PaymentIntent for a registration payment.
//
// Returns the `pi_..._secret_...` clientSecret that the embedded
// PaymentElement on the wizard's payment step expects. The webhook
// `payment_intent.succeeded` flips the registration to paid.
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
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        receipt_email: customerEmail,
        automatic_payment_methods: { enabled: true },
        description: `${seasonName} — registration for ${playerName}`,
        metadata: {
          registrationId,
          type: "registration_payment",
          ...(extraMetadata ?? {}),
        },
      },
      {
        idempotencyKey: `${registrationId}:pi:${amountCents}`,
      },
    );

    if (!paymentIntent.client_secret) {
      console.error("Stripe payment intent returned without client_secret");
      return null;
    }

    return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Error creating Stripe payment intent:", error);
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
