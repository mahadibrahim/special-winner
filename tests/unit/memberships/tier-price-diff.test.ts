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
  it("drift guard: monthlyCents set but monthlyPriceId null → create (never asserts a null id into 'replace'/'archive')", () => {
    const r = diffTierPrices(
      { monthlyCents: 2900, annualCents: 29000, monthlyPriceId: null, annualPriceId: "price_a" },
      { monthlyCents: 3100, annualCents: 29000 },
    );
    expect(r[0]).toEqual({ interval: "month", action: "create", amountCents: 3100 });
  });
  it("drift guard: cents set but priceId null, and next amount is null too → noop, not archive", () => {
    const r = diffTierPrices(
      { monthlyCents: 2900, annualCents: 29000, monthlyPriceId: null, annualPriceId: "price_a" },
      { monthlyCents: null, annualCents: 29000 },
    );
    expect(r[0]).toEqual({ interval: "month", action: "noop" });
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

  // Drift guard: a tier row can (via race, historical bad write, or manual
  // DB edit) end up with cents set but no matching Stripe price id on
  // record. A null id must never reach prices.update in admin-stripe.ts's
  // applyTierStripeEdits — the "replace"/"archive" actions here are only
  // ever returned when oldPriceId is a real string, so the guard lives in
  // the diff itself rather than relying on every call site to check.
  it("drift guard: technicalCents set but technicalPriceId null, amount changes → create (not replace with a null id)", () => {
    const action = diffSupplementPrice(900, null, 1100);
    expect(action).toEqual({ action: "create", amountCents: 1100 });
    expect(action).not.toHaveProperty("oldPriceId");
  });
  it("drift guard: cents set but priceId null, next is null too → noop, not archive", () => {
    const action = diffSupplementPrice(900, null, null);
    expect(action).toEqual({ action: "noop" });
  });
  it("drift guard: cents set but priceId null, next equals old cents → still create (self-heals by minting a fresh price)", () => {
    const action = diffSupplementPrice(900, null, 900);
    expect(action).toEqual({ action: "create", amountCents: 900 });
  });
});
