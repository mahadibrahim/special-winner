import { describe, it, expect } from "vitest";
import { resolveRate } from "@/lib/dropin/pricing";

const baseRateCard = {
  defaultSessionRateCents: 1500,
  defaultMemberRateCents: 1200,
};

const baseSession = {
  sessionRateCents: null,
  memberRateCents: null,
};

describe("resolveRate", () => {
  it("returns full session rate for non-logged-in user", () => {
    const rate = resolveRate(baseSession, null, null, baseRateCard);
    expect(rate.amountCents).toBe(1500);
    expect(rate.paymentMethod).toBe("card_online");
    expect(rate.membershipId).toBeNull();
  });

  it("returns full session rate for logged-in non-member", () => {
    const rate = resolveRate(baseSession, { id: "u1" }, null, baseRateCard);
    expect(rate.amountCents).toBe(1500);
    expect(rate.paymentMethod).toBe("card_online");
  });

  it("returns 0 for member with unlimited_pickup", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: true, free_pickup_per_month: 0 } },
      allotmentRemaining: 0,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(0);
    expect(rate.paymentMethod).toBe("member_unlimited");
    expect(rate.membershipId).toBe("m1");
  });

  it("returns 0 for member with allotment remaining", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: false, free_pickup_per_month: 4 } },
      allotmentRemaining: 2,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(0);
    expect(rate.paymentMethod).toBe("member_allotment");
    expect(rate.membershipId).toBe("m1");
  });

  it("returns member rate for member with no allotment left", () => {
    const membership = {
      id: "m1",
      tier: { benefits: { unlimited_pickup: false, free_pickup_per_month: 4 } },
      allotmentRemaining: 0,
    };
    const rate = resolveRate(baseSession, { id: "u1" }, membership, baseRateCard);
    expect(rate.amountCents).toBe(1200);
    expect(rate.paymentMethod).toBe("card_online");
    expect(rate.membershipId).toBe("m1");
  });

  it("uses session-level overrides when set", () => {
    const session = { sessionRateCents: 2000, memberRateCents: 1800 };
    const rate = resolveRate(session, null, null, baseRateCard);
    expect(rate.amountCents).toBe(2000);
  });
});
