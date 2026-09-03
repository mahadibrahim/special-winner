import { describe, it, expect } from "vitest";
import { requiresTechnicalPremium } from "@/lib/classes/technical-premium";

describe("requiresTechnicalPremium", () => {
  const base = { isTechnicalSlot: true, benefits: {}, technicalMonthlyCents: 900 };

  it("fires for a technical slot on a limited tier with a configured premium", () => {
    expect(requiresTechnicalPremium(base)).toBe(true);
  });
  it("never fires for a standard slot", () => {
    expect(requiresTechnicalPremium({ ...base, isTechnicalSlot: false })).toBe(false);
  });
  it("never fires for unlimited tiers", () => {
    expect(
      requiresTechnicalPremium({ ...base, benefits: { unlimited_classes: true } }),
    ).toBe(false);
  });
  it("never fires when no premium is configured (null or 0)", () => {
    expect(requiresTechnicalPremium({ ...base, technicalMonthlyCents: null })).toBe(false);
    expect(requiresTechnicalPremium({ ...base, technicalMonthlyCents: 0 })).toBe(false);
  });
});
