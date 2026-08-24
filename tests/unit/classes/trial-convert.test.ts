import { describe, it, expect } from "vitest";
import {
  computeScanWindow,
  hasClassBenefit,
  formatMonthlyPriceCents,
  TRIAL_CONVERT_MIN_DAYS_AGO,
  TRIAL_CONVERT_MAX_DAYS_AGO,
} from "@/lib/classes/trial-convert";

describe("computeScanWindow — pure date-range math", () => {
  it("returns a window from MAX_DAYS_AGO through MIN_DAYS_AGO before now", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const { endedAfter, endedBefore } = computeScanWindow(now);
    expect(endedBefore.toISOString()).toBe("2026-08-23T12:00:00.000Z");
    expect(endedAfter.toISOString()).toBe("2026-08-21T12:00:00.000Z");
  });

  it("uses the exported day constants (1..3)", () => {
    expect(TRIAL_CONVERT_MIN_DAYS_AGO).toBe(1);
    expect(TRIAL_CONVERT_MAX_DAYS_AGO).toBe(3);
  });

  it("boundaries are inclusive at exactly 1 day and exactly 3 days ago", () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    const { endedAfter, endedBefore } = computeScanWindow(now);
    const exactlyOneDayAgo = new Date(now.getTime() - 1 * 86_400_000);
    const exactlyThreeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
    expect(exactlyOneDayAgo.getTime()).toBe(endedBefore.getTime());
    expect(exactlyThreeDaysAgo.getTime()).toBe(endedAfter.getTime());
  });
});

describe("hasClassBenefit — pure benefit-key predicate", () => {
  it("is true for a tier with a positive classes_per_month", () => {
    expect(hasClassBenefit({ classes_per_month: 4 })).toBe(true);
  });

  it("is true for a tier with unlimited_classes", () => {
    expect(hasClassBenefit({ unlimited_classes: true })).toBe(true);
  });

  it("is false when classes_per_month is 0", () => {
    expect(hasClassBenefit({ classes_per_month: 0 })).toBe(false);
  });

  it("is false when classes_per_month is negative", () => {
    expect(hasClassBenefit({ classes_per_month: -1 })).toBe(false);
  });

  it("is false for an adult/pickup-only tier with unrelated benefits", () => {
    expect(
      hasClassBenefit({ rental_discount_pct: 10, unlimited_pickup: true }),
    ).toBe(false);
  });

  it("is false for an empty benefits object", () => {
    expect(hasClassBenefit({})).toBe(false);
  });

  it("is false when unlimited_classes is explicitly false", () => {
    expect(hasClassBenefit({ unlimited_classes: false, classes_per_month: 0 })).toBe(
      false,
    );
  });
});

describe("formatMonthlyPriceCents — pure price formatting", () => {
  it("formats a whole-dollar amount without decimals", () => {
    expect(formatMonthlyPriceCents(7900)).toBe("$79/mo");
  });

  it("formats a fractional-cent amount with exactly two decimals", () => {
    expect(formatMonthlyPriceCents(4990)).toBe("$49.90/mo");
  });

  it("falls back to a contact-us label for a null price", () => {
    expect(formatMonthlyPriceCents(null)).toBe("Ask us about pricing");
  });

  it("formats zero as a whole-dollar amount", () => {
    expect(formatMonthlyPriceCents(0)).toBe("$0/mo");
  });
});
