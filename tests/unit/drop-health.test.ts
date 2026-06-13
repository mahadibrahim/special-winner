import { describe, it, expect } from "vitest";
import { lbsToGrams, feetInchesToCm, computeBmi, isEligibleBmi, ELIGIBLE_BMI_MIN } from "@/lib/drop-league/health";

describe("drop-league health helpers", () => {
  it("converts lbs to grams", () => {
    expect(lbsToGrams(200)).toBe(90718);
  });
  it("converts ft/in to cm", () => {
    expect(feetInchesToCm(5, 10)).toBe(178);
  });
  it("computes BMI from grams + cm", () => {
    expect(computeBmi(90718, 178)).toBeCloseTo(28.6, 1);
  });
  it("gates eligibility at the 27.5 threshold (inclusive)", () => {
    expect(ELIGIBLE_BMI_MIN).toBe(27.5);
    expect(isEligibleBmi(27.5)).toBe(true);
    expect(isEligibleBmi(27.4)).toBe(false);
    expect(isEligibleBmi(31)).toBe(true);
  });
});
