import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT, validateRegistry } from "@/lib/curriculum/content";

describe("curriculum registry", () => {
  it("has the four weighted domains and at least four stages", () => {
    expect(CURRICULUM_CONTENT.domains.map((d) => d.name).sort()).toEqual([
      "physical",
      "psychological",
      "tactical",
      "technical",
    ]);
    const weightSum = CURRICULUM_CONTENT.domains.reduce(
      (s, d) => s + parseFloat(d.weightInOverall),
      0,
    );
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
      (["technical", "tactical", "physical", "psychological"] as const).map(
        (d) => [d, v2Skills.filter((k) => k.domain === d).length],
      ),
    );
    expect(byDomain).toEqual({
      technical: 5,
      tactical: 3,
      physical: 2,
      psychological: 3,
    });
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

  it("soccer activities: v2 canonical + gen-1 fill, deduped by slug", () => {
    const a = CURRICULUM_CONTENT.activities.filter((x) => x.sport === "soccer");
    expect(a.length).toBeGreaterThanOrEqual(50); // 9 v2 + 49 gen-1 − overlaps
    const slugs = a.map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // v2 marker: the comprehensive-guide generation is present
    expect(
      a.filter((x) => x.comprehensiveGuide != null).length,
    ).toBeGreaterThanOrEqual(9);
  });

  it("soccer session plans: at least the 4 v2 plans, segments carry coaching scripts", () => {
    const p = CURRICULUM_CONTENT.sessionPlans.filter(
      (x) => x.sport === "soccer",
    );
    expect(p.length).toBeGreaterThanOrEqual(4);
    expect(p.some((x) => x.structure.some((seg) => seg.coachingScript))).toBe(
      true,
    );
  });

  // Same fold-by-name method as Task 3's soccer skills (never by UUID). The
  // 13 v2-canonical basketball skills are the 5/3/2/3 floor; folding the two
  // upgrade files onto them (plus gen-0 shells from seed-curriculum.ts) adds
  // 20 more: 13 gen-0-named skills minus 1 name collision ("Help Defense",
  // where v2 wins as the base layer) plus 7 skills that exist only inside the
  // upgrade payloads. True total: 33. See
  // .superpowers/sdd/cr-task-5-report.md for the full fold-by-fold breakdown.
  it("basketball skills: 33 total — the 13 v2-canonical with the 5/3/2/3 domain split, plus 20 folded-in skills", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "basketball");
    expect(s).toHaveLength(33);

    const v2Names = new Set([
      "Ball Handling",
      "Passing",
      "Catching",
      "Shooting (Layups)",
      "Shooting (Jump Shot)",
      "Court Spacing",
      "Help Defense",
      "Transition Play",
      "Agility / Footwork",
      "Vertical Jump",
      "Confidence",
      "Coachability",
      "Team Communication",
    ]);
    const v2Skills = s.filter((k) => v2Names.has(k.name));
    expect(v2Skills).toHaveLength(13);
    const byDomain = Object.fromEntries(
      (["technical", "tactical", "physical", "psychological"] as const).map(
        (d) => [d, v2Skills.filter((k) => k.domain === d).length],
      ),
    );
    expect(byDomain).toEqual({
      technical: 5,
      tactical: 3,
      physical: 2,
      psychological: 3,
    });
    expect(v2Skills.every((k) => k.comprehensiveGuide != null)).toBe(true);

    // Every basketball skill that was ever touched by an upgrade file (all
    // v2-canonical + gen-0-shelled + brand-new skills) carries a
    // comprehensiveGuide.
    expect(s.every((k) => k.comprehensiveGuide != null)).toBe(true);
  });

  it("basketball skills: later upgrade pass wins over the earlier one for a name targeted twice", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "basketball");
    // "Crossover Dribble" is targeted by upgrade-2.ts twice (once annotated
    // "Development stage", once "Skill Building stage") -- both writes share
    // one identical guide object in the source, so folding by name collapses
    // them into a single entry with no content loss.
    const crossover = s.filter((k) => k.name === "Crossover Dribble");
    expect(crossover).toHaveLength(1);
    expect(crossover[0].comprehensiveGuide).toBeTruthy();

    // "Ball Handling" is v2-canonical AND separately targeted twice more by
    // upgrade-2.ts ("Fundamentals - ID 1"/"ID 2") -- same single-entry
    // collapse.
    const ballHandling = s.filter((k) => k.name === "Ball Handling");
    expect(ballHandling).toHaveLength(1);
  });

  it("basketball activities: v2 canonical + gen-1 fill, deduped by slug", () => {
    const a = CURRICULUM_CONTENT.activities.filter(
      (x) => x.sport === "basketball",
    );
    expect(a.length).toBeGreaterThanOrEqual(50); // 5 v2 + 49 gen-1 − overlaps
    const slugs = a.map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // v2 marker: the comprehensive-guide generation is present
    expect(
      a.filter((x) => x.comprehensiveGuide != null).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("basketball session plans: the gen-1 library subset (no v2-canonical basketball plans exist)", () => {
    const p = CURRICULUM_CONTENT.sessionPlans.filter(
      (x) => x.sport === "basketball",
    );
    expect(p.length).toBeGreaterThanOrEqual(7);
    expect(p.some((x) => x.structure.some((seg) => seg.coachingScript))).toBe(
      true,
    );
  });
});
