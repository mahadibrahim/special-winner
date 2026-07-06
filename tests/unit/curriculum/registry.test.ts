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
  // exist only inside the upgrade payloads themselves. Raw fold total: 34.
  // Before the first live load, a consolidation pass merged 8 near-duplicate
  // skills into their richer siblings (see
  // .superpowers/sdd/cr-consolidation-report.md): "Inside of Foot Pass" and
  // the general "Passing" into "Passing (Short)"; "Receiving with Inside of
  // Foot" and the general "Receiving" into "Receiving / First Touch";
  // "Defending 1v1" into "1v1 Defending"; "1v1 Moves" into "1v1 Dribbling
  // Moves"; "Shooting with Laces" into "Shooting"; and "Agility" into
  // "Agility - Change of Direction". True total: 26. See
  // .superpowers/sdd/cr-task-3-report.md for the full fold-by-fold breakdown.
  it("soccer skills: 26 total — the 13 v2-canonical with the 5/3/2/3 domain split, plus 13 folded-in skills after de-duplication", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "soccer");
    expect(s).toHaveLength(26);

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
  // upgrade payloads. Raw fold total: 33. Before the first live load, a
  // consolidation pass merged 7 near-duplicate skills into their richer
  // siblings (see .superpowers/sdd/cr-consolidation-report.md): "Stationary
  // Ball Handling" into "Ball Handling"; "Chest Pass" into "Two-Hand Chest
  // Pass"; "Shooting Form" into "Form Shooting"; "Layup" into "Layups -
  // Dominant Hand"; "Pull-Up Jumper" into "Pull-Up Jump Shot"; and both
  // "Spacing Awareness" and "Spacing" into "Court Spacing". True total: 26.
  // See .superpowers/sdd/cr-task-5-report.md for the full fold-by-fold
  // breakdown.
  it("basketball skills: 26 total — the 13 v2-canonical with the 5/3/2/3 domain split, plus 13 folded-in skills after de-duplication", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "basketball");
    expect(s).toHaveLength(26);

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

  // Hockey has exactly one source file (curriculum-v2__hockey-skills.ts) —
  // no upgrade pass, no gen-0 fold (src/lib/db/seed-curriculum.ts only seeds
  // soccer and basketball) — so this is a single-pass transcription and the
  // v2-canonical count IS the true count.
  it("hockey skills: exactly 13 with the 5/3/2/3 domain split, all with comprehensive guides", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "hockey");
    expect(s).toHaveLength(13);
    const byDomain = Object.fromEntries(
      (["technical", "tactical", "physical", "psychological"] as const).map(
        (d) => [d, s.filter((k) => k.domain === d).length],
      ),
    );
    expect(byDomain).toEqual({
      technical: 5,
      tactical: 3,
      physical: 2,
      psychological: 3,
    });
    expect(s.every((k) => k.comprehensiveGuide != null)).toBe(true);
    expect(s.every((k) => k.stage === "fundamentals")).toBe(true);
  });

  // Wave-2 refine added an originally-authored hockey activities library
  // (see src/lib/curriculum/content/hockey/activities.ts header for
  // sourcing/provenance).
  it("hockey activities: at least 20, every skill slug covered", () => {
    const hockeyActivities = CURRICULUM_CONTENT.activities.filter(
      (x) => x.sport === "hockey",
    );
    expect(hockeyActivities.length).toBeGreaterThanOrEqual(20);

    const slugs = hockeyActivities.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const hockeySkillSlugs = new Set(
      CURRICULUM_CONTENT.skills
        .filter((s) => s.sport === "hockey")
        .map((s) => s.slug),
    );
    const coveredSkillSlugs = new Set(
      hockeyActivities.flatMap((a) => a.skillsDeveloped ?? []),
    );
    for (const slug of hockeySkillSlugs) {
      expect(coveredSkillSlugs.has(slug)).toBe(true);
    }
  });

  // A later wave-2 pass added an originally-authored hockey session-plan
  // library on top of the activities library above (see
  // src/lib/curriculum/content/hockey/session-plans.ts header for
  // sourcing/provenance) -- a 4-plan fundamentals-stage progression built as
  // ADM-style station rotations.
  it("hockey session plans: 4 fundamentals-stage plans, segments carry coaching scripts", () => {
    const p = CURRICULUM_CONTENT.sessionPlans.filter(
      (x) => x.sport === "hockey",
    );
    expect(p.length).toBeGreaterThanOrEqual(4);
    expect(p.every((x) => x.stage === "fundamentals")).toBe(true);
    expect(p.some((x) => x.structure.some((seg) => seg.coachingScript))).toBe(
      true,
    );

    const names = p.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // Baseball originally had no v2-canonical skills file and no gen-0 rows in
  // src/lib/db/seed-curriculum.ts — the only pre-wave-2 source was
  // curriculum-v2__baseball-skills-upgrade.ts, which UPDATEs a single
  // pre-existing skill row ("Throwing Mechanics") by hardcoded uuid rather
  // than inserting a full row (see .superpowers/sdd/cr-task-6-report.md for
  // that reconstruction's reasoning). Wave 2 (2026-07-05) built baseball
  // fundamentals out to 12 skills total (5 technical / 2 tactical /
  // 2 physical / 3 psychological), anchored on USA Baseball's LTAD
  // four core competencies (unordered set per USA Baseball LTAD; our teaching sequence is editorial) and the keep-rules-minimal
  // principle from docs/curriculum/research/2026-07-05-brief.md §2. See
  // .superpowers/sdd/w2r-3-report.md for the full skill list by domain.
  it("baseball skills: 12 total (5 technical / 2 tactical / 2 physical / 3 psychological), Throwing Mechanics preserved from the original upgrade payload", () => {
    const s = CURRICULUM_CONTENT.skills.filter((k) => k.sport === "baseball");
    expect(s).toHaveLength(12);

    const throwing = s.find((k) => k.name === "Throwing Mechanics");
    expect(throwing).toBeTruthy();
    expect(throwing?.domain).toBe("technical");
    expect(throwing?.comprehensiveGuide).toBeTruthy();

    const byDomain = (d: string) => s.filter((k) => k.domain === d).length;
    expect(byDomain("technical")).toBe(5);
    expect(byDomain("tactical")).toBe(2);
    expect(byDomain("physical")).toBe(2);
    expect(byDomain("psychological")).toBe(3);

    expect(s.every((k) => k.comprehensiveGuide)).toBe(true);
    expect(
      s.every((k) => k.stage === "fundamentals" || k.stage === "skill-building"),
    ).toBe(true);
  });

  it("baseball: no activities or session plans invented (none exist in the recovered seeds)", () => {
    expect(
      CURRICULUM_CONTENT.activities.filter((x) => x.sport === "baseball"),
    ).toHaveLength(0);
    expect(
      CURRICULUM_CONTENT.sessionPlans.filter((x) => x.sport === "baseball"),
    ).toHaveLength(0);
  });

  // Task 7: coach guidance content (prompts, resources, principles).
  // Sources: coach-prompts.ts + coach-resources.ts (original pass) folded
  // with coach-training-modules.ts ("Phase 7: Content Expansion", a later,
  // larger pass over the same three tables). See
  // src/lib/curriculum/content/coach-guidance.ts header for the full
  // provenance/collision-resolution notes and .superpowers/sdd/cr-task-7-report.md
  // for the report.
  describe("coach guidance", () => {
    it("has non-empty prompts, resources, and principles", () => {
      expect(CURRICULUM_CONTENT.coachGuidance.prompts.length).toBeGreaterThan(0);
      expect(CURRICULUM_CONTENT.coachGuidance.resources.length).toBeGreaterThan(0);
      expect(CURRICULUM_CONTENT.coachGuidance.principles.length).toBeGreaterThan(0);
    });

    it("matches the true counts from folding both recovered generations plus the wave-2 sport guidance floor", () => {
      // 29 (coach-prompts.ts) + 30 (coach-training-modules.ts promptsData)
      // + 4 wave-2 additions (2 hockey + 2 baseball, see coach-guidance.ts)
      expect(CURRICULUM_CONTENT.coachGuidance.prompts).toHaveLength(63);
      // 12 (coach-resources.ts) + 9 (coach-training-modules.ts resourcesData)
      // + 2 wave-2 additions (1 hockey + 1 baseball article)
      // + 1 Phase 2 addition (assessment calibration guide)
      expect(CURRICULUM_CONTENT.coachGuidance.resources).toHaveLength(24);
      // 5 (coach-prompts.ts) + 15 (coach-training-modules.ts principlesData)
      // minus 1 dropped natural-key collision ("Development Over Winning")
      // + 3 wave-2 additions (hockey, baseball, relative-age-effect)
      expect(CURRICULUM_CONTENT.coachGuidance.principles).toHaveLength(22);
    });

    it("coach_prompts natural key (content) has no duplicates", () => {
      const contents = CURRICULUM_CONTENT.coachGuidance.prompts.map(
        (p) => p.content,
      );
      expect(new Set(contents).size).toBe(contents.length);
      expect(contents.every((c) => typeof c === "string" && c.length > 0)).toBe(
        true,
      );
    });

    it("coach_resources natural key (title) has no duplicates", () => {
      const titles = CURRICULUM_CONTENT.coachGuidance.resources.map(
        (r) => r.title,
      );
      expect(new Set(titles).size).toBe(titles.length);
    });

    it("coaching_principles natural key (title) has no duplicates, including the resolved collision", () => {
      const titles = CURRICULUM_CONTENT.coachGuidance.principles.map(
        (p) => p.title,
      );
      expect(new Set(titles).size).toBe(titles.length);
      // The collision was resolved in favor of the training-modules.ts
      // (later, richer) version -- assert that specific version won.
      const devOverWinning = CURRICULUM_CONTENT.coachGuidance.principles.find(
        (p) => p.title === "Development Over Winning",
      );
      expect(devOverWinning).toBeTruthy();
      expect(devOverWinning?.principle).toContain(
        "Prioritize individual player development over team results",
      );
    });

    it("validateRegistry still passes with coach guidance content loaded", () => {
      expect(validateRegistry(CURRICULUM_CONTENT)).toEqual([]);
    });
  });
});
