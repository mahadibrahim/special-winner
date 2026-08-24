import { describe, it, expect } from "vitest";
import { computeClassAllotmentRemaining } from "@/lib/memberships/allotment";

describe("computeClassAllotmentRemaining", () => {
  it("unlimited wins over any count", () => {
    expect(
      computeClassAllotmentRemaining({ unlimited_classes: true, classes_per_month: 4 }, 99),
    ).toBe("unlimited");
  });
  it("cap minus used, floored at zero", () => {
    expect(computeClassAllotmentRemaining({ classes_per_month: 4 }, 1)).toBe(3);
    expect(computeClassAllotmentRemaining({ classes_per_month: 4 }, 6)).toBe(0);
  });
  it("no class benefit → 0", () => {
    expect(computeClassAllotmentRemaining({ free_pickup_per_month: 4 }, 0)).toBe(0);
  });
});
