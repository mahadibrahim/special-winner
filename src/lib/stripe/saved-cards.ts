/**
 * Save-card (SetupIntent-style) + off-session charge helpers for the team
 * captain deposit/backstop flow.
 *
 * The captain pays a deposit up front with a card we SAVE
 * (`setup_future_usage: "off_session"`), so that if invitees never pay their
 * shares we can charge the captain's card off-session as the backstop. The
 * orchestration that decides WHEN to fire the backstop lives in the team
 * captain charge module (Task 6); this file just wraps the two Stripe calls.
 */
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/memberships/stripe";

/** Stripe client accessor that throws if Stripe isn't configured. */
function getStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe not configured");
  }
  return stripe;
}

/**
 * PaymentIntent for the captain deposit that also SAVES the card for later
 * off-session charges (the backstop). Returns the client secret to confirm now
 * + the customer id to persist on the team_registrations row.
 */
export async function createDepositIntentWithSavedCard(params: {
  userId: string;
  email: string;
  amountCents: number;
  metadata: Record<string, string>;
}): Promise<{ clientSecret: string; customerId: string }> {
  const s = getStripe();
  const customerId = await getOrCreateStripeCustomer({
    userId: params.userId,
    email: params.email,
  });
  const pi = await s.paymentIntents.create({
    amount: params.amountCents,
    currency: "usd",
    customer: customerId,
    // Cards only, deliberately — no automatic payment methods for THIS
    // intent. The saved instrument must be off-session-chargeable for the
    // post-deadline backstop, which Klarna/Cash App/Amazon Pay/ACH are not
    // (or not reliably). Regular registration payments are unaffected.
    payment_method_types: ["card"],
    setup_future_usage: "off_session",
    metadata: params.metadata,
  });
  return { clientSecret: pi.client_secret!, customerId };
}

/** Charge a previously-saved card off-session (captain backstop). */
export async function chargeSavedCardOffSession(params: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}): Promise<{ paymentIntentId: string; status: string }> {
  const s = getStripe();
  const pi = await s.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: "usd",
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: params.metadata,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
  return { paymentIntentId: pi.id, status: pi.status };
}
