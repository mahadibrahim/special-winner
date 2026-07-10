import { describe, expect, it } from "vitest";
import {
  mapAgeBandToStages,
  evaluateGuardrails,
  resolveSuggestionSkillSlugs,
  resolveSkillInputsForSlugs,
  type GuardrailInput,
} from "@/lib/curriculum/guardrails";

// Stage age bands mirrored from src/lib/curriculum/content/reference.ts
// STAGES: discovery 3-5, fundamentals 6-8, skill-building 9-10,
// development 11-12, competitive 13-15, refinement 16-18.

describe("mapAgeBandToStages", () => {
  it("maps a band fully inside one stage to just that stage", () => {
    expect(mapAgeBandToStages(9, 10)).toEqual(["skill-building"]);
  });

  it("maps a band spanning an edge overlap between two adjacent stages", () => {
    // 8 is fundamentals' max, 9 is skill-building's min -- band [8,9]
    // touches both.
    expect(mapAgeBandToStages(8, 9)).toEqual(["fundamentals", "skill-building"]);
  });

  it("does not include a stage whose range starts one year past the band's max", () => {
    // development starts at 11; a band maxing at 10 must not include it.
    expect(mapAgeBandToStages(9, 10)).not.toContain("development");
  });

  it("maps a single-age band sitting exactly on a stage boundary", () => {
    expect(mapAgeBandToStages(11, 11)).toEqual(["development"]);
  });

  it("maps a wide band to every overlapping stage", () => {
    expect(mapAgeBandToStages(5, 12)).toEqual([
      "discovery",
      "fundamentals",
      "skill-building",
      "development",
    ]);
  });
});

describe("evaluateGuardrails", () => {
  const baseActivity = (
    overrides: Partial<GuardrailInput["activities"][number]> = {},
  ): GuardrailInput["activities"][number] => ({
    name: "Defensive Heading Clinic",
    appropriateStages: null,
    skills: [],
    ...overrides,
  });

  it("is not evaluable when both season ages are null", () => {
    const result = evaluateGuardrails({
      seasonMinAge: null,
      seasonMaxAge: null,
      activities: [baseActivity()],
    });
    expect(result.evaluable).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(result.warns).toEqual([]);
  });

  it("blocks a safety-flagged skill when the season includes an age below the rule's minAge", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 9,
      seasonMaxAge: 10,
      activities: [
        baseActivity({
          skills: [
            { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
          ],
        }),
      ],
    });
    expect(result.evaluable).toBe(true);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].activityName).toBe("Defensive Heading Clinic");
    expect(result.blocks[0].skillName).toBe("Heading - Defensive");
    expect(result.blocks[0].reason).toMatch(/blocked/i);
    expect(result.blocks[0].rule).toBe("No heading in training for players 10 and under");
    expect(result.blocks[0].source).toContain("US Soccer");
  });

  it("does NOT block when the season's minAge is at or above the rule's minAge", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 11,
      seasonMaxAge: 14,
      activities: [
        baseActivity({
          skills: [
            { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
          ],
        }),
      ],
    });
    expect(result.blocks).toEqual([]);
  });

  it("does not block skills with no safety rule", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 3,
      seasonMaxAge: 5,
      activities: [
        baseActivity({
          skills: [{ slug: "ball-control", name: "Ball Control", introductionAge: 4 }],
        }),
      ],
    });
    expect(result.blocks).toEqual([]);
  });

  it("warns when an activity's appropriateStages shares no stage with the season band", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 9,
      seasonMaxAge: 10, // skill-building
      activities: [
        baseActivity({
          name: "Fundamentals-only Passing Game",
          appropriateStages: ["fundamentals"],
        }),
      ],
    });
    expect(result.warns).toHaveLength(1);
    expect(result.warns[0].activityName).toBe("Fundamentals-only Passing Game");
    // Plain-language display names, not hyphenated slugs.
    expect(result.warns[0].reason).not.toContain("skill-building");
    expect(result.warns[0].reason).toContain("Fundamentals");
    expect(result.warns[0].reason).toContain("Skill Building");
  });

  it("does NOT warn when appropriateStages overlaps the season band", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 9,
      seasonMaxAge: 10,
      activities: [
        baseActivity({
          name: "Skill Building Passing Game",
          appropriateStages: ["skill-building"],
        }),
      ],
    });
    expect(result.warns).toEqual([]);
  });

  it("does not warn when appropriateStages is null (unset)", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 9,
      seasonMaxAge: 10,
      activities: [baseActivity({ appropriateStages: null })],
    });
    expect(result.warns).toEqual([]);
  });

  it("warn phrasing never leaks a raw stage slug for any stage pairing", () => {
    const result = evaluateGuardrails({
      seasonMinAge: 3,
      seasonMaxAge: 5, // discovery
      activities: [
        baseActivity({ name: "Advanced Tactics Session", appropriateStages: ["competitive"] }),
      ],
    });
    expect(result.warns).toHaveLength(1);
    const reason = result.warns[0].reason;
    expect(reason).not.toContain("competitive-"); // no hyphenated slug fragments
    expect(reason).not.toContain("_");
  });

  // Fail-closed asymmetric-null age band cases (T2/T3 review finding #1).
  describe("fail-closed null age band handling", () => {
    it("blocks when minAge is null but maxAge is known (asymmetric null must not fail open)", () => {
      const result = evaluateGuardrails({
        seasonMinAge: null,
        seasonMaxAge: 15,
        activities: [
          baseActivity({
            skills: [
              { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
            ],
          }),
        ],
      });
      expect(result.evaluable).toBe(true);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].reason.toLowerCase()).toContain("youngest age isn't set");
      expect(result.blocks[0].rule).toBe("No heading in training for players 10 and under");
      expect(result.blocks[0].source).toContain("US Soccer");
    });

    it("blocks a safety-ruled skill even when both bounds are null (evaluable stays false)", () => {
      const result = evaluateGuardrails({
        seasonMinAge: null,
        seasonMaxAge: null,
        activities: [
          baseActivity({
            skills: [
              { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
            ],
          }),
        ],
      });
      expect(result.evaluable).toBe(false);
      expect(result.blocks).toHaveLength(1);
      expect(result.warns).toEqual([]);
    });

    it("does NOT block when the floor is known and at/above the rule's minAge, even with a null ceiling", () => {
      const result = evaluateGuardrails({
        seasonMinAge: 12,
        seasonMaxAge: null,
        activities: [
          baseActivity({
            skills: [
              { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
            ],
          }),
        ],
      });
      expect(result.blocks).toEqual([]);
    });

    it("blocks when the floor is known and below the rule's minAge, with a null ceiling", () => {
      const result = evaluateGuardrails({
        seasonMinAge: 8,
        seasonMaxAge: null,
        activities: [
          baseActivity({
            skills: [
              { slug: "heading-defensive", name: "Heading - Defensive", introductionAge: 11 },
            ],
          }),
        ],
      });
      expect(result.blocks).toHaveLength(1);
    });
  });
});

describe("resolveSuggestionSkillSlugs", () => {
  it("resolves a registry activity name (case-insensitive) to its developed skill slugs", () => {
    const result = resolveSuggestionSkillSlugs(["Heading Progression"]);
    expect(result).toContain("heading-defensive");
  });

  it("resolves case-insensitively and by slug too", () => {
    expect(resolveSuggestionSkillSlugs(["heading progression"])).toContain("heading-defensive");
    expect(resolveSuggestionSkillSlugs(["heading-progression"])).toContain("heading-defensive");
  });

  it("ignores unmatched/garbage strings", () => {
    expect(resolveSuggestionSkillSlugs(["not a real activity", "asdf1234"])).toEqual([]);
  });

  it("returns [] for null/undefined/empty input", () => {
    expect(resolveSuggestionSkillSlugs(null)).toEqual([]);
    expect(resolveSuggestionSkillSlugs(undefined)).toEqual([]);
    expect(resolveSuggestionSkillSlugs([])).toEqual([]);
  });
});

describe("resolveSkillInputsForSlugs", () => {
  it("resolves a known slug to a GuardrailSkillInput with registry name/introductionAge", () => {
    const [input] = resolveSkillInputsForSlugs(["heading-defensive"]);
    expect(input.slug).toBe("heading-defensive");
    expect(input.name).toBeTruthy();
  });

  it("drops unknown slugs", () => {
    expect(resolveSkillInputsForSlugs(["not-a-real-skill-slug"])).toEqual([]);
  });

  it("feeds evaluateGuardrails to block a safety skill discovered only via free-text suggestions", () => {
    const slugs = resolveSuggestionSkillSlugs(["Heading Progression"]);
    const skills = resolveSkillInputsForSlugs(slugs);
    const result = evaluateGuardrails({
      seasonMinAge: 8,
      seasonMaxAge: 10,
      activities: [
        {
          name: "Some Template",
          appropriateStages: null,
          skills,
        },
      ],
    });
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].rule).toBe("No heading in training for players 10 and under");
  });
});
