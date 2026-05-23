/**
 * Stripe wrappers for membership subscriptions.
 *
 * Uses Stripe Checkout in subscription mode for the signup flow — mirrors
 * the rentals/drop-in Checkout pattern so the front-end is "POST, redirect
 * to checkoutUrl" instead of integrating Stripe Elements.
 *
 * Connect-aware:
 *   - When the org has `stripeAccountId`, every subscription is created
 *     with `transfer_data.destination` + `application_fee_percent` so funds
 *     settle on the partner account net of our platform cut.
 *   - When `stripeAccountId` is null, we fall through to a direct charge
 *     on the platform account (identical to today's rentals fallback).
 *
 * Idempotency keys: `${userId}:${tierId}:${interval}:checkout` for the
 * subscribe call; this lets a double-clicked CTA reuse the same Checkout
 * Session URL within Stripe's 24h cache window.
 */
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";

const PLATFORM_FEE_PCT = 10; // 10% platform cut — matches rentals default.

export function membershipsStripe(): Stripe {
  if (!stripe) {
    throw new Error("Stripe not configured");
  }
  return stripe;
}

/**
 * Resolve to a Stripe Customer id for the user. If `existingCustomerId` is
 * passed and still valid, reuse it; otherwise create one. The caller is
 * responsible for persisting the returned id on the `memberships` row.
 */
export async function getOrCreateStripeCustomer(opts: {
  userId: string;
  email: string;
  name?: string | null;
  existingCustomerId?: string | null;
}): Promise<string> {
  const s = membershipsStripe();
  if (opts.existingCustomerId) {
    // Verify the customer still exists; Stripe deletions are rare but possible.
    try {
      const cust = await s.customers.retrieve(opts.existingCustomerId);
      if (!cust.deleted) return opts.existingCustomerId;
    } catch {
      // Fall through to creating a new one.
    }
  }
  const created = await s.customers.create(
    {
      email: opts.email,
      name: opts.name ?? undefined,
      metadata: { aspire_user_id: opts.userId },
    },
    { idempotencyKey: `${opts.userId}:stripe-customer:v1` },
  );
  return created.id;
}

/**
 * Create a Stripe Checkout Session in subscription mode for a tier × interval.
 *
 * The session's metadata carries the fields the webhook needs to insert the
 * `memberships` row on `checkout.session.completed`.
 */
export async function createSubscriptionCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  userId: string;
  organizationId: string;
  tierId: string;
  billingInterval: "month" | "year";
  partnerStripeAccountId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const s = membershipsStripe();

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      type: "membership_subscription",
      user_id: opts.userId,
      organization_id: opts.organizationId,
      tier_id: opts.tierId,
      billing_interval: opts.billingInterval,
    },
    ...(opts.partnerStripeAccountId
      ? {
          application_fee_percent: PLATFORM_FEE_PCT,
          transfer_data: { destination: opts.partnerStripeAccountId },
        }
      : {}),
  };

  const session = await s.checkout.sessions.create(
    {
      mode: "subscription",
      customer: opts.customerId,
      line_items: [{ price: opts.priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: {
        type: "membership_subscription",
        user_id: opts.userId,
        organization_id: opts.organizationId,
        tier_id: opts.tierId,
        billing_interval: opts.billingInterval,
      },
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    },
    {
      idempotencyKey: `${opts.userId}:${opts.tierId}:${opts.billingInterval}:checkout:v1`,
    },
  );

  if (!session.url) {
    throw new Error("Stripe Checkout Session has no URL");
  }
  return { url: session.url, sessionId: session.id };
}

/** Cancel at period end — keeps the membership active until the paid window expires. */
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const s = membershipsStripe();
  return await s.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/** Pause billing immediately. Stripe keeps the subscription on the customer; status flips to 'paused' via webhook. */
export async function pauseSubscription(
  subscriptionId: string,
  opts?: { resumesAt?: Date | null },
): Promise<Stripe.Subscription> {
  const s = membershipsStripe();
  return await s.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "keep_as_draft",
      ...(opts?.resumesAt
        ? { resumes_at: Math.floor(opts.resumesAt.getTime() / 1000) }
        : {}),
    },
  });
}

/** Resume a paused subscription. */
export async function resumeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const s = membershipsStripe();
  return await s.subscriptions.update(subscriptionId, {
    pause_collection: null,
  });
}
