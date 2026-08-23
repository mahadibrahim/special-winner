import { describe, it, expect } from "vitest";
import { buildSubscriptionCheckoutParams } from "@/lib/memberships/stripe";

const baseOpts = {
  customerId: "cus_1",
  priceId: "price_monthly",
  userId: "user-1",
  organizationId: "org-1",
  tierId: "tier-1",
  billingInterval: "month" as const,
  partnerStripeAccountId: null,
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
  brand: "aspire",
};

describe("buildSubscriptionCheckoutParams", () => {
  it("adult/self subscription: one line item, no discounts, no family_member_id", () => {
    const { params, idempotencyKey } = buildSubscriptionCheckoutParams(baseOpts);

    expect(params.line_items).toEqual([{ price: "price_monthly", quantity: 1 }]);
    expect(params).not.toHaveProperty("discounts");
    expect(params.metadata?.family_member_id).toBeUndefined();
    expect(params.subscription_data?.metadata?.family_member_id).toBeUndefined();
    expect(idempotencyKey).toBe(
      "user-1:self:tier-1:month:price_monthly:nofee:nocoupon:checkout:v1",
    );
  });

  it("child subscription with a fee price: two line items", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      familyMemberId: "kid-1",
      feePriceId: "price_fee",
    });

    expect(params.line_items).toEqual([
      { price: "price_monthly", quantity: 1 },
      { price: "price_fee", quantity: 1 },
    ]);
  });

  it("child subscription without a fee price: one line item", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      familyMemberId: "kid-1",
      feePriceId: null,
    });

    expect(params.line_items).toEqual([{ price: "price_monthly", quantity: 1 }]);
  });

  it("family_member_id present in both metadata blocks only when given", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      familyMemberId: "kid-1",
    });

    expect(params.metadata?.family_member_id).toBe("kid-1");
    expect(params.subscription_data?.metadata?.family_member_id).toBe("kid-1");
  });

  it("couponId present: discounts array carries the coupon", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      familyMemberId: "kid-1",
      couponId: "sibling-10pct",
    });

    expect(params.discounts).toEqual([{ coupon: "sibling-10pct" }]);
  });

  it("no couponId: discounts key is absent entirely", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      familyMemberId: "kid-1",
      couponId: null,
    });

    expect(params).not.toHaveProperty("discounts");
  });

  it("idempotency key falls back to 'self' when no familyMemberId, and includes the child id when present", () => {
    expect(buildSubscriptionCheckoutParams(baseOpts).idempotencyKey).toBe(
      "user-1:self:tier-1:month:price_monthly:nofee:nocoupon:checkout:v1",
    );
    expect(
      buildSubscriptionCheckoutParams({ ...baseOpts, familyMemberId: "kid-1" })
        .idempotencyKey,
    ).toBe(
      "user-1:kid-1:tier-1:month:price_monthly:nofee:nocoupon:checkout:v1",
    );
  });

  it("idempotency key fingerprints price-affecting params: priceId, feePriceId, couponId", () => {
    // Different priceId (e.g. monthly vs annual, or a tier price edit) →
    // different key, so Stripe never rejects a legitimately-different
    // session as a stale-params retry of the same cached key.
    expect(
      buildSubscriptionCheckoutParams({ ...baseOpts, priceId: "price_other" })
        .idempotencyKey,
    ).toBe(
      "user-1:self:tier-1:month:price_other:nofee:nocoupon:checkout:v1",
    );
    expect(
      buildSubscriptionCheckoutParams({
        ...baseOpts,
        familyMemberId: "kid-1",
        feePriceId: "price_fee",
      }).idempotencyKey,
    ).toBe(
      "user-1:kid-1:tier-1:month:price_monthly:price_fee:nocoupon:checkout:v1",
    );
    expect(
      buildSubscriptionCheckoutParams({
        ...baseOpts,
        familyMemberId: "kid-1",
        couponId: "sibling-10pct-1500c",
      }).idempotencyKey,
    ).toBe(
      "user-1:kid-1:tier-1:month:price_monthly:nofee:sibling-10pct-1500c:checkout:v1",
    );
  });

  it("Connect: partner account id adds application_fee_percent + transfer_data", () => {
    const { params } = buildSubscriptionCheckoutParams({
      ...baseOpts,
      partnerStripeAccountId: "acct_123",
    });

    expect(params.subscription_data?.application_fee_percent).toBe(10);
    expect(params.subscription_data?.transfer_data).toEqual({
      destination: "acct_123",
    });
  });
});
