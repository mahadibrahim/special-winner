import { describe, it, expect } from "vitest";
import { computeDiscountCents } from "@/lib/discounts/validate";

// computeDiscountCents is the pure pricing half of the shared discount helper;
// eligibility (DB-backed) is covered by API tests.
describe("computeDiscountCents", () => {
  it("percentage: discountValue is percent × 100 (1500 = 15%)", () => {
    expect(computeDiscountCents({ discountType: "percentage", discountValue: 1500 } as any, 100000)).toBe(15000);
  });
  it("percentage honors maxDiscountCents cap", () => {
    expect(
      computeDiscountCents({ discountType: "percentage", discountValue: 5000, maxDiscountCents: 10000 } as any, 100000),
    ).toBe(10000);
  });
  it("fixed amount is taken straight off", () => {
    expect(computeDiscountCents({ discountType: "fixed_amount", discountValue: 10000 } as any, 100000)).toBe(10000);
  });
  it("fixed amount never exceeds the purchase (no negative total)", () => {
    expect(computeDiscountCents({ discountType: "fixed_amount", discountValue: 10000 } as any, 5000)).toBe(5000);
  });
});
