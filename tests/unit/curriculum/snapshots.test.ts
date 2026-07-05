import { describe, expect, it } from "vitest";
import { computeDomainAverages } from "@/lib/curriculum/snapshots";

const d1 = "domain-1", d2 = "domain-2";
const at = (s: string) => new Date(s);

describe("computeDomainAverages", () => {
  it("uses only the latest assessment per skill", () => {
    const out = computeDomainAverages([
      { skillId: "s1", domainId: d1, level: 2, assessedAt: at("2026-06-01") },
      { skillId: "s1", domainId: d1, level: 4, assessedAt: at("2026-07-01") }, // latest wins
      { skillId: "s2", domainId: d1, level: 3, assessedAt: at("2026-06-15") },
    ]);
    expect(out.get(d1)).toEqual({ average: 3.5, skillCount: 2, assessmentCount: 3 });
  });

  it("keeps domains independent and rounds to 2dp", () => {
    const out = computeDomainAverages([
      { skillId: "a", domainId: d1, level: 5, assessedAt: at("2026-06-01") },
      { skillId: "b", domainId: d2, level: 2, assessedAt: at("2026-06-01") },
      { skillId: "c", domainId: d2, level: 3, assessedAt: at("2026-06-01") },
      { skillId: "d", domainId: d2, level: 3, assessedAt: at("2026-06-01") },
    ]);
    expect(out.get(d1)!.average).toBe(5);
    expect(out.get(d2)!.average).toBe(2.67);
  });
});
