import { describe, it, expect } from "vitest";
import { diffTierPrices, diffSupplementPrice } from "@/lib/memberships/tier-price-diff";

const old = { monthlyCents: 2900, annualCents: 29000, monthlyPriceId: "price_m", annualPriceId: "price_a" };

describe("diffTierPrices", () => {
  it("no change → all noop", () => {
    const r = diffTierPrices(old, { monthlyCents: 2900, annualCents: 29000 });
    expect(r).toEqual([
      { interval: "month", action: "noop" },
      { interval: "year", action: "noop" },
    ]);
  });
  it("monthly amount changed → replace with oldPriceId", () => {
    const r = diffTierPrices(old, { monthlyCents: 3100, annualCents: 29000 });
    expect(r[0]).toEqual({ interval: "month", action: "replace", amountCents: 3100, oldPriceId: "price_m" });
    expect(r[1]).toEqual({ interval: "year", action: "noop" });
  });
  it("annual added (was null) → create", () => {
    const r = diffTierPrices(
      { monthlyCents: 2900, annualCents: null, monthlyPriceId: "price_m", annualPriceId: null },
      { monthlyCents: 2900, annualCents: 29000 },
    );
    expect(r[1]).toEqual({ interval: "year", action: "create", amountCents: 29000 });
  });
  it("monthly removed (now null) → archive", () => {
    const r = diffTierPrices(old, { monthlyCents: null, annualCents: 29000 });
    expect(r[0]).toEqual({ interval: "month", action: "archive", oldPriceId: "price_m" });
  });
});

// diffSupplementPrice backs both the annual fee price (one-time) and the
// technical-training supplement price (recurring monthly) — both follow the
// same create/replace/archive/noop contract in admin-stripe.ts's
// applyTierStripeEdits, so the pure diff logic is shared.
describe("diffSupplementPrice", () => {
  it("no change → noop", () => {
    expect(diffSupplementPrice(5000, "price_f", 5000)).toEqual({ action: "noop" });
  });
  it("both null → noop", () => {
    expect(diffSupplementPrice(null, null, null)).toEqual({ action: "noop" });
  });
  it("added (was null) → create", () => {
    expect(diffSupplementPrice(null, null, 900)).toEqual({ action: "create", amountCents: 900 });
  });
  it("removed (now null) → archive", () => {
    expect(diffSupplementPrice(5000, "price_f", null)).toEqual({
      action: "archive",
      oldPriceId: "price_f",
    });
  });
  it("replaces the technical price when the amount changes", () => {
    // Mirrors the fee-price change case exactly, with technical ids substituted.
    const action = diffSupplementPrice(900, "p_t", 1100);
    expect(action).toEqual({ action: "replace", amountCents: 1100, oldPriceId: "p_t" });
  });
});
