/**
 * Stripe client + payment intent helper.
 *
 * Idempotency keys are passed to every Stripe write so Netlify Function
 * retries (and double-fired client requests) don't double-charge.
 *
 * Key conventions used across the codebase:
 *   - registration payment intent: `${registrationId}:pi:${category}:${amountCents}:v2`
 *   - connect registration PI:     `${registrationId}:connect-pi:${category}:${amountCents}:v2`
 *   - refund:                      `${registrationId}:refund:${amountCents}`
 *   - connect account create:      `${organizationId}:connect-account`
 *
 * The amountCents suffix matters because partial-pay flows can legitimately
 * charge the same registration multiple times for different amounts; using
 * a static `${id}:pi` would make the second charge fail with the Stripe
 * duplicate-idempotency-key error. The `:category:` suffix lets the
 * customer flip bank↔card on the payment step and get distinct intents,
 * and `:v2` is a manual version salt to break Stripe's 24h idempotency
 * cache when the parameter shape changes across deploys.
 */
import Stripe from "stripe";
import {
  computeSurchargeCents,
  type PaymentMethodCategory,
} from "@/lib/payments/surcharge";

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
// `paymentMethodCategory` controls both the methods Stripe will offer and
// the surcharge applied to the total:
//   - "bank" → us_bank_account only, no surcharge
//   - "card" → card + wallets + BNPL, 2.9% + $0.30 surcharge added to the
//             PaymentIntent amount (presented as a separate line in the
//             order summary on the client)
//   - omitted → legacy behavior (Stripe's automatic methods, no surcharge)
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
  paymentMethodCategory,
}: {
  registrationId: string;
  seasonName: string;
  playerName: string;
  amountCents: number;
  customerEmail: string;
  extraMetadata?: Record<string, string>;
  paymentMethodCategory?: PaymentMethodCategory;
}): Promise<{ id: string; clientSecret: string; surchargeCents: number } | null> {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  const surchargeCents = paymentMethodCategory
    ? computeSurchargeCents(amountCents, paymentMethodCategory)
    : 0;
  const totalCents = amountCents + surchargeCents;

  // Narrow `payment_method_types` to match the category the customer
  // chose on the previous screen. This prevents them from sneaking into
  // the no-fee bank flow after we already added the card surcharge to
  // the amount (and vice-versa).
  //
  // payment_method_types and automatic_payment_methods are mutually
  // exclusive on PaymentIntent.create — when narrowing, omit the latter.
  //
  // BNPL methods (klarna, affirm, cashapp, amazon_pay, afterpay_clearpay)
  // each require explicit per-account activation in the Stripe dashboard.
  // Including a non-activated method in payment_method_types fails the
  // whole PaymentIntent with StripeInvalidRequestError, which is how a
  // freshly-activated live account ended up unable to start any payment.
  // Card includes Visa/MC + Apple Pay + Google Pay (wallets over card)
  // out of the box. To add BNPL later: enable each in Stripe dashboard,
  // then add the literal back to this array.
  const paymentMethodTypes: string[] | undefined =
    paymentMethodCategory === "bank"
      ? ["us_bank_account"]
      : paymentMethodCategory === "card"
        ? ["card"]
        : undefined;

  const params: Stripe.PaymentIntentCreateParams = {
    amount: totalCents,
    currency: "usd",
    receipt_email: customerEmail,
    description: `${seasonName} — registration for ${playerName}`,
    metadata: {
      registrationId,
      type: "registration_payment",
      ...(paymentMethodCategory ? { payment_method_category: paymentMethodCategory } : {}),
      ...(surchargeCents > 0 ? { surcharge_cents: surchargeCents.toString() } : {}),
      ...(extraMetadata ?? {}),
    },
    ...(paymentMethodTypes
      ? { payment_method_types: paymentMethodTypes }
      : { automatic_payment_methods: { enabled: true } }),
  };

  try {
    const paymentIntent = await stripe.paymentIntents.create(params, {
      // Idempotency key includes the method category and the
      // surcharge-inclusive total so flipping bank↔card creates a fresh
      // intent rather than colliding with a previous one. The :v2 suffix
      // is a manual salt — bump when the request body shape changes
      // across deploys for the same registration+category+total.
      idempotencyKey: `${registrationId}:pi:${paymentMethodCategory ?? "auto"}:${totalCents}:v2`,
    });

    if (!paymentIntent.client_secret) {
      console.error("Stripe payment intent returned without client_secret");
      return null;
    }

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      surchargeCents,
    };
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
