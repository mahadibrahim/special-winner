import { describe, expect, it } from "vitest";
import {
  cadenceThresholdDays,
  computeCadenceMatrix,
  computeCadenceStatus,
  daysBetween,
  summarizeLevelDistribution,
  worstStatus,
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

describe("worstStatus", () => {
  it("ranks fresh < due < overdue < never", () => {
    expect(worstStatus(["fresh", "due"])).toBe("due");
    expect(worstStatus(["due", "overdue", "fresh"])).toBe("overdue");
    expect(worstStatus(["overdue", "never"])).toBe("never");
    expect(worstStatus([])).toBe("fresh");
  });
});

describe("computeCadenceMatrix", () => {
  const domains = [
    { domainId: "d-weekly", displayName: "Technical", assessmentFrequency: "weekly" },
    { domainId: "d-monthly", displayName: "Tactical", assessmentFrequency: "monthly" },
  ];
  const player = { familyMemberId: "p1", firstName: "Ada", lastName: "Lovelace" };

  it("applies each domain's own frequency to the same player", () => {
    const [row] = computeCadenceMatrix(
      [player],
      domains,
      [
        { familyMemberId: "p1", domainId: "d-weekly", lastAssessedAt: daysAgo(20) },
        { familyMemberId: "p1", domainId: "d-monthly", lastAssessedAt: daysAgo(20) },
      ],
      NOW,
    );
    const byDomain = Object.fromEntries(row.domains.map((d) => [d.domainId, d.status]));
    expect(byDomain["d-weekly"]).toBe("overdue"); // 20 days >= 2 × 7
    expect(byDomain["d-monthly"]).toBe("fresh"); // 20 days < 30
    expect(row.worstStatus).toBe("overdue");
    expect(row.hasAnyAssessment).toBe(true);
  });

  it("flags a never-assessed player across every domain", () => {
    const [row] = computeCadenceMatrix([player], domains, [], NOW);
    expect(row.domains.every((d) => d.status === "never")).toBe(true);
    expect(row.domains.every((d) => d.daysSinceLast === null)).toBe(true);
    expect(row.worstStatus).toBe("never");
    expect(row.hasAnyAssessment).toBe(false);
  });

  it("keeps players independent and carries threshold metadata", () => {
    const p2 = { familyMemberId: "p2", firstName: "Grace", lastName: "Hopper" };
    const rows = computeCadenceMatrix(
      [player, p2],
      domains,
      [{ familyMemberId: "p2", domainId: "d-monthly", lastAssessedAt: daysAgo(30) }],
      NOW,
    );
    const p2Row = rows.find((r) => r.familyMemberId === "p2")!;
    const monthly = p2Row.domains.find((d) => d.domainId === "d-monthly")!;
    expect(monthly.status).toBe("due"); // exactly at the threshold
    expect(monthly.daysSinceLast).toBe(30);
    expect(monthly.thresholdDays).toBe(30);
    expect(rows.find((r) => r.familyMemberId === "p1")!.worstStatus).toBe("never");
  });
});

describe("summarizeLevelDistribution", () => {
  it("returns null when there are no assessments", () => {
    expect(summarizeLevelDistribution([])).toBeNull();
  });

  it("computes mean and population spread, 2dp", () => {
    expect(summarizeLevelDistribution([5, 5, 5])).toEqual({ count: 3, mean: 5, stdDev: 0 });
    expect(summarizeLevelDistribution([2, 4])).toEqual({ count: 2, mean: 3, stdDev: 1 });
    expect(summarizeLevelDistribution([1, 2, 4])).toEqual({ count: 3, mean: 2.33, stdDev: 1.25 });
  });
});
