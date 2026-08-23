import { describe, it, expect } from "vitest";
import { computeMemberCampDiscountCents } from "@/lib/memberships/camp-discount";

describe("computeMemberCampDiscountCents", () => {
  it("10% of the early-bird-adjusted amount, rounded", () => {
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 10 })).toBe(1990);
    expect(computeMemberCampDiscountCents(19999, { camp_discount_pct: 10 })).toBe(2000);
  });
  it("0 without the benefit, with 0 pct, or out-of-range pct", () => {
    expect(computeMemberCampDiscountCents(19900, {})).toBe(0);
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 0 })).toBe(0);
    expect(computeMemberCampDiscountCents(19900, { camp_discount_pct: 200 })).toBe(0);
  });
});
