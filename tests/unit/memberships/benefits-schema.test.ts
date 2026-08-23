import { describe, it, expect } from "vitest";
import { benefitsSchema } from "@/lib/memberships/tier-units";

describe("benefitsSchema class keys", () => {
  it("accepts the class package keys", () => {
    const parsed = benefitsSchema.parse({
      classes_per_month: 4,
      unlimited_classes: false,
      camp_discount_pct: 10,
    });
    expect(parsed.classes_per_month).toBe(4);
    expect(parsed.camp_discount_pct).toBe(10);
  });
  it("rejects out-of-range camp_discount_pct", () => {
    expect(() => benefitsSchema.parse({ camp_discount_pct: 101 })).toThrow();
  });
});
