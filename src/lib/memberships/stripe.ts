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
 * Idempotency keys: `${userId}:${familyMemberId ?? "self"}:${tierId}:${interval}:${priceId}:${feePriceId ?? "nofee"}:${couponId ?? "nocoupon"}:checkout`
 * for the subscribe call; this lets a double-clicked CTA reuse the same
 * Checkout Session URL within Stripe's 24h cache window, keeps two
 * children of the same parent from colliding on the same key, AND
 * fingerprints every price-affecting param. Stripe rejects a reused key
 * whose params changed (StripeIdempotencyError) — an admin editing a
 * tier's price/fee/coupon mid-window would otherwise 502 a legitimate,
 * unrelated retry for the same (user, child, tier, interval).
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

/** Opts shared by {@link buildSubscriptionCheckoutParams} and {@link createSubscriptionCheckoutSession}. */
export interface SubscriptionCheckoutOpts {
  customerId: string;
  priceId: string;
  userId: string;
  organizationId: string;
  tierId: string;
  billingInterval: "month" | "year";
  partnerStripeAccountId: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Storefront brand ("aspire" | "soccerone") — host-derived by the caller,
   *  since both brands share one org and one Stripe account. */
  brand: string;
  /** Tier display name — carried so the webhook can label GA4/Meta items. */
  tierName?: string;
  /** Ad-attribution ids (collectAdAttribution) → server-side conversions. */
  adAttribution?: Record<string, string>;
  /** Child (family_members.id) this subscription is for — youth per-child
   *  memberships. Absent for adult/self memberships. */
  familyMemberId?: string;
  /** One-time annual fee Price, added as a second line item when present.
   *  Only attached for child subscriptions with a configured tier fee. */
  feePriceId?: string | null;
  /** Sibling-discount coupon id (see sibling-discount.ts), when eligible. */
  couponId?: string | null;
}

/**
 * Pure assembly of the Stripe Checkout Session create params + idempotency
 * key from subscribe opts. Split out from {@link createSubscriptionCheckoutSession}
 * so the line-items/discounts/metadata wiring (fee line item, sibling
 * coupon, per-child metadata + idempotency key) is unit-testable without a
 * live Stripe client.
 */
export function buildSubscriptionCheckoutParams(
  opts: SubscriptionCheckoutOpts,
): {
  params: Stripe.Checkout.SessionCreateParams;
  idempotencyKey: string;
} {
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      type: "membership_subscription",
      user_id: opts.userId,
      organization_id: opts.organizationId,
      tier_id: opts.tierId,
      billing_interval: opts.billingInterval,
      brand: opts.brand,
      ...(opts.familyMemberId ? { family_member_id: opts.familyMemberId } : {}),
    },
    ...(opts.partnerStripeAccountId
      ? {
          application_fee_percent: PLATFORM_FEE_PCT,
          transfer_data: { destination: opts.partnerStripeAccountId },
        }
      : {}),
  };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: opts.customerId,
    line_items: [
      { price: opts.priceId, quantity: 1 },
      ...(opts.feePriceId ? [{ price: opts.feePriceId, quantity: 1 }] : []),
    ],
    subscription_data: subscriptionData,
    // `discounts` and `allow_promotion_codes` are mutually exclusive in
    // Checkout — we don't use promotion codes, so no conflict.
    ...(opts.couponId ? { discounts: [{ coupon: opts.couponId }] } : {}),
    metadata: {
      type: "membership_subscription",
      user_id: opts.userId,
      organization_id: opts.organizationId,
      tier_id: opts.tierId,
      billing_interval: opts.billingInterval,
      brand: opts.brand,
      ...(opts.familyMemberId ? { family_member_id: opts.familyMemberId } : {}),
      ...(opts.tierName ? { tier_name: opts.tierName } : {}),
      // Ad-attribution ids → webhook fires server-side GA4 + Meta purchases.
      ...(opts.adAttribution ?? {}),
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };

  // Fingerprint every price-affecting param, not just the identity ones —
  // Stripe rejects a reused key whose params changed within the 24h
  // idempotency window (StripeIdempotencyError), which would otherwise
  // 502 a legitimate retry after a price/fee/coupon edit.
  const idempotencyKey = `${opts.userId}:${opts.familyMemberId ?? "self"}:${opts.tierId}:${opts.billingInterval}:${opts.priceId}:${opts.feePriceId ?? "nofee"}:${opts.couponId ?? "nocoupon"}:checkout:v1`;

  return { params, idempotencyKey };
}

/**
 * Create a Stripe Checkout Session in subscription mode for a tier × interval.
 *
 * The session's metadata carries the fields the webhook needs to insert the
 * `memberships` row on `checkout.session.completed`.
 */
export async function createSubscriptionCheckoutSession(
  opts: SubscriptionCheckoutOpts,
): Promise<{ url: string; sessionId: string }> {
  const s = membershipsStripe();
  const { params, idempotencyKey } = buildSubscriptionCheckoutParams(opts);

  const session = await s.checkout.sessions.create(params, { idempotencyKey });

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
