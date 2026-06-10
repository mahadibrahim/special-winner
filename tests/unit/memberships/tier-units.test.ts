import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars, benefitsSchema, tierInputSchema } from "@/lib/memberships/tier-units";

describe("dollarsToCents", () => {
  it("converts 29 → 2900", () => expect(dollarsToCents(29)).toBe(2900));
  it("rounds 29.999 → 3000", () => expect(dollarsToCents(29.999)).toBe(3000));
  it("null passes through", () => expect(dollarsToCents(null)).toBeNull());
});

describe("centsToDollars", () => {
  it("2900 → 29", () => expect(centsToDollars(2900)).toBe(29));
  it("null passes through", () => expect(centsToDollars(null)).toBeNull());
});

describe("benefitsSchema", () => {
  it("accepts known typed keys", () => {
    const r = benefitsSchema.parse({ rental_discount_pct: 10, unlimited_pickup: true });
    expect(r.rental_discount_pct).toBe(10);
  });
  it("rejects pct > 100", () => expect(() => benefitsSchema.parse({ rental_discount_pct: 150 })).toThrow());
  it("rejects negative counts", () => expect(() => benefitsSchema.parse({ free_pickup_per_month: -1 })).toThrow());
  it("preserves unknown keys", () => {
    const r = benefitsSchema.parse({ future_perk: 5 }) as Record<string, unknown>;
    expect(r.future_perk).toBe(5);
  });
});

describe("tierInputSchema", () => {
  const base = { name: "Member", monthlyDollars: 29, annualDollars: 290, benefits: {}, displayOrder: 0, isActive: true };
  it("accepts a valid tier", () => expect(tierInputSchema.parse(base).name).toBe("Member"));
  it("rejects empty name", () => expect(() => tierInputSchema.parse({ ...base, name: "" })).toThrow());
  it("rejects when both prices null", () =>
    expect(() => tierInputSchema.parse({ ...base, monthlyDollars: null, annualDollars: null })).toThrow());
});
