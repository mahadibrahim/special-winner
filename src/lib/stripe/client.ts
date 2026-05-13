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

// Create a checkout session for registration payment.
//
// `paymentMethodCategory` controls both the methods Stripe will offer and
// the surcharge applied to the total:
//   - "bank" → us_bank_account only, no surcharge
//   - "card" → card + wallets + BNPL, 2.9% + $0.30 surcharge added as a
//             separate line item so the customer sees the fee called out
//   - omitted → legacy behavior (no surcharge, Stripe's automatic methods)
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

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
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
  ];
  if (surchargeCents > 0) {
    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: "Card processing fee",
          description: "Pay by bank to avoid this fee.",
        },
        unit_amount: surchargeCents,
      },
      quantity: 1,
    });
  }

  // Narrow `payment_method_types` to match the category the customer
  // chose on the previous screen. This prevents them from sneaking into
  // the no-fee bank flow after we already attached the card surcharge
  // line item (and vice-versa). Cast required because TS resolves the
  // bare `PaymentMethodType` symbol against a narrower union than the
  // one Stripe's SDK actually accepts at runtime.
  const paymentMethodTypes = (
    paymentMethodCategory === "bank"
      ? ["us_bank_account"]
      : paymentMethodCategory === "card"
        ? ["card", "klarna", "affirm", "cashapp", "amazon_pay", "afterpay_clearpay"]
        : undefined
  ) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | undefined;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "custom",
        line_items: lineItems,
        mode: "payment",
        customer_email: customerEmail,
        ...(paymentMethodTypes ? { payment_method_types: paymentMethodTypes } : {}),
        metadata: {
          registrationId,
          type: "registration_payment",
          ...(paymentMethodCategory ? { payment_method_category: paymentMethodCategory } : {}),
          ...(surchargeCents > 0 ? { surcharge_cents: surchargeCents.toString() } : {}),
          ...(extraMetadata ?? {}),
        },
      },
      {
        // Idempotency key includes the method category and the
        // surcharge-inclusive total so flipping bank↔card creates a fresh
        // session rather than colliding with a previous one. The :v2
        // suffix exists to break through Stripe's 24h idempotency cache
        // when the parameter shape changes across deploys; bump it when
        // you intentionally alter the request body for the same
        // registration+category+total.
        idempotencyKey: `${registrationId}:checkout:${paymentMethodCategory ?? "auto"}:${amountCents + surchargeCents}:v2`,
      },
    );

    if (!session.client_secret) {
      console.error("Stripe session returned without client_secret");
      return null;
    }

    return {
      id: session.id,
      clientSecret: session.client_secret,
      surchargeCents,
    };
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
