import { describe, expect, it } from "vitest";
import {
  cadenceThresholdDays,
  computeCadenceStatus,
  daysBetween,
} from "@/lib/curriculum/assessment-cadence";

const NOW = new Date("2026-07-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("cadenceThresholdDays", () => {
  it("maps the seeded skill_domains.assessmentFrequency values", () => {
    expect(cadenceThresholdDays("weekly")).toBe(7);
    expect(cadenceThresholdDays("monthly")).toBe(30);
    expect(cadenceThresholdDays("per_season")).toBe(90);
  });

  it("returns null for null or unrecognized values", () => {
    expect(cadenceThresholdDays(null)).toBeNull();
    expect(cadenceThresholdDays("fortnightly")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("returns whole days, flooring partial days", () => {
    expect(daysBetween(daysAgo(30), NOW)).toBe(30);
    // 29 days and 20 hours ago is still 29 whole days.
    expect(
      daysBetween(new Date(NOW.getTime() - (29 * 24 + 20) * 3_600_000), NOW),
    ).toBe(29);
  });
});

describe("computeCadenceStatus", () => {
  it("returns never when the player has no assessment in the domain", () => {
    expect(computeCadenceStatus(null, "monthly", NOW)).toBe("never");
    // never applies even when the domain has no cadence configured
    expect(computeCadenceStatus(null, null, NOW)).toBe("never");
  });

  it("is fresh strictly below the threshold and due exactly at it", () => {
    expect(computeCadenceStatus(daysAgo(29), "monthly", NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(30), "monthly", NOW)).toBe("due");
  });

  it("becomes overdue at twice the threshold", () => {
    expect(computeCadenceStatus(daysAgo(59), "monthly", NOW)).toBe("due");
    expect(computeCadenceStatus(daysAgo(60), "monthly", NOW)).toBe("overdue");
  });

  it("applies each frequency's own threshold", () => {
    expect(computeCadenceStatus(daysAgo(8), "weekly", NOW)).toBe("due");
    expect(computeCadenceStatus(daysAgo(8), "monthly", NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(89), "per_season", NOW)).toBe("fresh");
  });

  it("treats an unmapped frequency as no cadence: fresh once assessed", () => {
    expect(computeCadenceStatus(daysAgo(400), null, NOW)).toBe("fresh");
    expect(computeCadenceStatus(daysAgo(400), "fortnightly", NOW)).toBe("fresh");
  });
});
