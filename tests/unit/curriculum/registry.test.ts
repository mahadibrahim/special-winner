import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT, validateRegistry } from "@/lib/curriculum/content";

describe("curriculum registry", () => {
  it("has the four weighted domains and at least four stages", () => {
    expect(CURRICULUM_CONTENT.domains.map((d) => d.name).sort()).toEqual([
      "physical", "psychological", "tactical", "technical",
    ]);
    const weightSum = CURRICULUM_CONTENT.domains
      .reduce((s, d) => s + parseFloat(d.weightInOverall), 0);
    expect(weightSum).toBeCloseTo(1.0, 2);
    expect(CURRICULUM_CONTENT.stages.length).toBeGreaterThanOrEqual(4);
  });

  it("validates: unique slugs, resolvable references", () => {
    expect(validateRegistry(CURRICULUM_CONTENT)).toEqual([]);
  });

  // The v2 canonical soccer skills are the 13/5-3-2-3 floor described in the
  // plan. Folding the four upgrade passes onto them (by name, not UUID) adds
  // 21 more: 13 gen-0-named skills that upgrade payloads target (matched
  // against the shells in src/lib/db/seed-curriculum.ts) plus 8 skills that
  // exist only inside the upgrade payloads themselves. True total: 34. See
  // .superpowers/sdd/cr-task-3-report.md for the full fold-by-fold breakdown.
  it("soccer skills: 34 total — the 13 v2-canonical with the 5/3/2/3 domain split, plus 21 folded-in skills", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "soccer");
    expect(s).toHaveLength(34);

    const v2Names = new Set([
      "Ball Control",
      "Passing (Short)",
      "Receiving / First Touch",
      "Dribbling",
      "Shooting",
      "Finding Space",
      "Support Play",
      "1v1 Defending",
      "Agility & Coordination",
      "Speed",
      "Confidence",
      "Resilience",
      "Teamwork",
    ]);
    const v2Skills = s.filter((k) => v2Names.has(k.name));
    expect(v2Skills).toHaveLength(13);
    const byDomain = Object.fromEntries(
      (["technical", "tactical", "physical", "psychological"] as const).map((d) => [
        d,
        v2Skills.filter((k) => k.domain === d).length,
      ]),
    );
    expect(byDomain).toEqual({ technical: 5, tactical: 3, physical: 2, psychological: 3 });
    expect(v2Skills.every((k) => k.comprehensiveGuide != null)).toBe(true);

    // Every soccer skill (v2-canonical and folded-in alike) carries a
    // comprehensiveGuide — the folded skills all originate from
    // comprehensiveGuide-bearing upgrade payloads.
    expect(s.every((k) => k.comprehensiveGuide != null)).toBe(true);
  });

  it("soccer skills: later upgrade passes win over v2's own comprehensiveGuide (per field)", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "soccer");
    const ballControl = s.find((k) => k.name === "Ball Control")!;
    // upgrade-4 ("final quality fixes") is the latest pass touching Ball
    // Control's coachingTips — it rewrites them as guiding questions.
    expect(ballControl.coachingTips?.some((t) => t.includes("?"))).toBe(true);

    const findingSpace = s.find((k) => k.name === "Finding Space")!;
    // upgrade-4 is also the latest pass for Finding Space.
    expect(findingSpace.comprehensiveGuide).toBeTruthy();
  });
});
