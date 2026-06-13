/**
 * Stripe helpers for Drop League subscription checkout.
 *
 * Drop League pricing:
 *   - $99/month recurring subscription (DROP_PRICE_ID_MONTHLY)
 *   - $25 one-time registration fee (DROP_PRICE_ID_REGISTRATION)
 *
 * Both line items are included in a single subscription-mode Checkout Session.
 * Stripe supports mixing a recurring price and a one-time price in subscription
 * mode — the one-time item is billed on the first invoice only.
 *
 * Env vars are read via process.env (optional, not in the validated env schema)
 * — the same pattern used for other optional Stripe config (e.g. STRIPE_KIOSK_PMC_ID).
 * Founder creates the live Stripe Prices and sets them in Netlify.
 *
 * Idempotency key: `${dropPlayerId}:drop-checkout:v1` — within Stripe's 24h cache
 * window, a double-clicked CTA reuses the same Checkout Session URL.
 */
import type Stripe from "stripe";
import {
  membershipsStripe,
  getOrCreateStripeCustomer,
} from "@/lib/memberships/stripe";

// Read via process.env — optional config, not registered in the validated env schema.
// Founder sets these in Netlify; locally left blank (createDropCheckoutSession
// throws with a clear message if either is missing at call time).
const MONTHLY_PRICE = process.env.DROP_PRICE_ID_MONTHLY;
const REGISTRATION_PRICE = process.env.DROP_PRICE_ID_REGISTRATION;

export { getOrCreateStripeCustomer };

export async function createDropCheckoutSession(opts: {
  customerId: string;
  dropPlayerId: string;
  dropSeasonId: string;
  organizationId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  if (!MONTHLY_PRICE || !REGISTRATION_PRICE) {
    throw new Error(
      "Drop League Stripe price IDs are not configured (DROP_PRICE_ID_MONTHLY / DROP_PRICE_ID_REGISTRATION)",
    );
  }

  const s = membershipsStripe();

  return s.checkout.sessions.create(
    {
      mode: "subscription",
      customer: opts.customerId,
      line_items: [
        { price: MONTHLY_PRICE, quantity: 1 },
        { price: REGISTRATION_PRICE, quantity: 1 },
      ],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: {
        type: "drop_subscription",
        drop_player_id: opts.dropPlayerId,
        drop_season_id: opts.dropSeasonId,
        organization_id: opts.organizationId,
        user_id: opts.userId,
      },
      subscription_data: {
        metadata: {
          type: "drop_subscription",
          drop_player_id: opts.dropPlayerId,
        },
      },
    },
    { idempotencyKey: `${opts.dropPlayerId}:drop-checkout:v1` },
  );
}
