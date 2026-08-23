import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSiblingEligible } from "@/lib/memberships/sibling-discount";

describe("isSiblingEligible", () => {
  it("eligible when another child of the same user holds a live membership", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-a", status: "active" }],
        "kid-b",
      ),
    ).toBe(true);
  });
  it("not eligible for the same child (re-subscribe) or with no existing rows", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-b", status: "active" }],
        "kid-b",
      ),
    ).toBe(false);
    expect(isSiblingEligible([], "kid-b")).toBe(false);
  });
});

// getSiblingCouponId needs a DB + Stripe client. It's mocked here (rather
// than hit through the API test's real Checkout call) specifically to lock
// down the amount_off math — this is the piece that caused the staging
// incident: a percent_off coupon discounted the annual fee line item too,
// contrary to spec ("10% off each additional child's MONTHLY PACKAGE;
// annual fees stay $45 each"). See the module doc comment for why
// amount_off (not percent_off) is required.
describe("getSiblingCouponId", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/memberships/stripe");
    vi.resetModules();
  });

  it("returns null immediately without touching the DB when monthlyPriceCents is null", async () => {
    const getDbSpy = vi.fn();
    vi.doMock("@/lib/db", () => ({ getDb: getDbSpy }));
    const { getSiblingCouponId } = await import(
      "@/lib/memberships/sibling-discount"
    );

    const result = await getSiblingCouponId("org-1", "user-1", "kid-b", null);

    expect(result).toBeNull();
    expect(getDbSpy).not.toHaveBeenCalled();
  });

  it("computes a fixed amount_off from the tier's monthlyPriceCents and embeds it in the coupon id", async () => {
    // First `db.select().from(memberships).where(...)` is awaited directly
    // (no .limit) — an existing sibling row makes the caller eligible.
    // Second `db.select().from(organizations).where(...).limit(1)` returns
    // the org row (default siblingDiscountPct → 10%).
    let call = 0;
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => {
            call += 1;
            if (call === 1) {
              return [{ familyMemberId: "kid-a", status: "active" }];
            }
            return { limit: () => Promise.resolve([{ settings: {} }]) };
          },
        }),
      }),
    };
    vi.doMock("@/lib/db", () => ({ getDb: () => dbMock }));

    const couponsCreate = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/memberships/stripe", () => ({
      membershipsStripe: () => ({ coupons: { create: couponsCreate } }),
    }));

    const { getSiblingCouponId } = await import(
      "@/lib/memberships/sibling-discount"
    );

    // monthlyPriceCents 15000 (Class Tier example), default 10% → $15 off.
    const couponId = await getSiblingCouponId(
      "org-1",
      "user-1",
      "kid-b",
      15000,
    );

    expect(couponId).toBe("sibling-10pct-1500c");
    expect(couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sibling-10pct-1500c",
        amount_off: 1500,
        currency: "usd",
        duration: "forever",
      }),
    );
    // Never percent_off — that's exactly the bug this fix closes.
    expect(couponsCreate.mock.calls[0][0]).not.toHaveProperty("percent_off");
  });
});
