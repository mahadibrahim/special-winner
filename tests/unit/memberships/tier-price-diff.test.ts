import { describe, it, expect } from "vitest";
import { diffTierPrices } from "@/lib/memberships/tier-price-diff";

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
