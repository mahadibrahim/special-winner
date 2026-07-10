import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import {
  UNIVERSAL_GLOWS,
  getSkillGlow,
  getSkillGrow,
  getSessionChips,
} from "@/lib/curriculum/reinforcement";

// Jargon that must never leak into parent/kid-facing chip text. Skill slugs
// are checked separately per-skill (below) since they differ per entry.
const JARGON_BLACKLIST = [
  "LTAD",
  "ADM",
  "fundamentals-tagged",
  "elimination-free",
  "USSF",
  "USA Hockey",
  "USA Baseball",
  "stage",
  "domain",
  "psychological",
  "tactical",
  "assess",
];

function assertNoJargon(text: string, context: string) {
  const lower = text.toLowerCase();
  for (const term of JARGON_BLACKLIST) {
    expect(lower, `${context} contains blacklisted jargon "${term}": "${text}"`).not.toContain(
      term.toLowerCase(),
    );
  }
}

function assertGlowShape(glow: string, context: string) {
  expect(glow.length, `${context} glow length "${glow}"`).toBeGreaterThanOrEqual(4);
  expect(glow.length, `${context} glow length "${glow}"`).toBeLessThanOrEqual(48);
  expect(glow.endsWith("."), `${context} glow should not end with a period: "${glow}"`).toBe(
    false,
  );
  expect(
    glow.charAt(0),
    `${context} glow should start uppercase: "${glow}"`,
  ).toBe(glow.charAt(0).toUpperCase());
  assertNoJargon(glow, `${context} glow`);
}

function assertGrowShape(grow: string, context: string) {
  expect(
    grow.startsWith("Working on "),
    `${context} grow must start with "Working on ": "${grow}"`,
  ).toBe(true);
  expect(grow.length, `${context} grow length "${grow}"`).toBeLessThanOrEqual(60);
  assertNoJargon(grow, `${context} grow`);
}

const SPORTS_TO_TEST: { sport: string; todo?: boolean }[] = [
  { sport: "soccer" },
  { sport: "basketball" },
  { sport: "hockey" },
  { sport: "baseball" },
];

describe("SKILL_REINFORCEMENT coverage", () => {
  it.each(SPORTS_TO_TEST)(
    "$sport: every skill has a glow and a grow",
    ({ sport, todo }) => {
      if (todo) {
        // Hockey/baseball coverage lands in Task 4 -- unskip there.
        return;
      }

      const skills = CURRICULUM_CONTENT.skills.filter((s) => s.sport === sport);
      expect(skills.length).toBeGreaterThan(0);

      for (const skill of skills) {
        const glow = getSkillGlow(skill.slug);
        const grow = getSkillGrow(skill.slug);

        expect(glow, `${sport}/${skill.slug} should have a glow`).not.toBeNull();
        expect(grow, `${sport}/${skill.slug} should have a grow`).not.toBeNull();

        assertGlowShape(glow as string, `${sport}/${skill.slug}`);
        assertGrowShape(grow as string, `${sport}/${skill.slug}`);

        // No returned string should leak the internal (hyphenated) slug
        // itself. Single-word slugs like "dribbling" or "speed" are legit
        // English words that legitimately appear in the copy -- the ban
        // targets slug-shaped identifier text, e.g. "1v1-defending".
        if (skill.slug.includes("-")) {
          expect((glow as string).toLowerCase()).not.toContain(skill.slug.toLowerCase());
          expect((grow as string).toLowerCase()).not.toContain(skill.slug.toLowerCase());
        }
      }
    },
  );

  it("no returned string (any authored skill or universal chip) leaks any curriculum skill slug", () => {
    const allSlugs = CURRICULUM_CONTENT.skills.map((s) => s.slug.toLowerCase());
    const texts: string[] = [...UNIVERSAL_GLOWS];

    for (const { sport, todo } of SPORTS_TO_TEST) {
      if (todo) continue;
      for (const skill of CURRICULUM_CONTENT.skills.filter((s) => s.sport === sport)) {
        const glow = getSkillGlow(skill.slug);
        const grow = getSkillGrow(skill.slug);
        if (glow) texts.push(glow);
        if (grow) texts.push(grow);
      }
    }

    for (const text of texts) {
      const lower = text.toLowerCase();
      for (const slug of allSlugs) {
        if (slug.includes("-")) {
          expect(lower, `"${text}" leaks skill slug "${slug}"`).not.toContain(slug);
        }
      }
    }
  });
});

describe("UNIVERSAL_GLOWS", () => {
  it("has exactly 8 entries", () => {
    expect(UNIVERSAL_GLOWS.length).toBe(8);
  });

  it("has no duplicate entries", () => {
    expect(new Set(UNIVERSAL_GLOWS).size).toBe(UNIVERSAL_GLOWS.length);
  });

  it("every entry follows glow shape and language rules", () => {
    for (const glow of UNIVERSAL_GLOWS) {
      assertGlowShape(glow, "UNIVERSAL_GLOWS");
    }
  });

  it("contains no jargon across every entry (aggregate check)", () => {
    for (const glow of UNIVERSAL_GLOWS) {
      assertNoJargon(glow, "UNIVERSAL_GLOWS entry");
    }
  });
});

describe("getSkillGlow / getSkillGrow", () => {
  it("returns null for an unknown slug", () => {
    expect(getSkillGlow("not-a-real-skill-slug")).toBeNull();
    expect(getSkillGrow("not-a-real-skill-slug")).toBeNull();
  });

  it("returns authored glows/grows for hockey/baseball slugs", () => {
    const hockeySkill = CURRICULUM_CONTENT.skills.find((s) => s.sport === "hockey");
    const baseballSkill = CURRICULUM_CONTENT.skills.find((s) => s.sport === "baseball");
    expect(hockeySkill).toBeDefined();
    expect(baseballSkill).toBeDefined();
    if (hockeySkill) {
      expect(getSkillGlow(hockeySkill.slug)).not.toBeNull();
      expect(getSkillGrow(hockeySkill.slug)).not.toBeNull();
    }
    if (baseballSkill) {
      expect(getSkillGlow(baseballSkill.slug)).not.toBeNull();
      expect(getSkillGrow(baseballSkill.slug)).not.toBeNull();
    }
  });
});

describe("getSessionChips", () => {
  it("resolves glows/grows for known skill slugs, deduped and capped", () => {
    const soccerSlugs = CURRICULUM_CONTENT.skills
      .filter((s) => s.sport === "soccer")
      .map((s) => s.slug)
      .slice(0, 6);

    // Duplicate the slugs to exercise dedupe.
    const result = getSessionChips({ skillSlugs: [...soccerSlugs, ...soccerSlugs] });

    expect(result.glows.length).toBeLessThanOrEqual(4 + UNIVERSAL_GLOWS.length);
    expect(result.grows.length).toBeLessThanOrEqual(3);

    // No duplicate glow or grow strings.
    expect(new Set(result.glows).size).toBe(result.glows.length);
    expect(new Set(result.grows).size).toBe(result.grows.length);

    // Universal glows are appended after skill glows.
    const skillGlowCount = result.glows.length - UNIVERSAL_GLOWS.filter((g) =>
      result.glows.includes(g),
    ).length;
    expect(skillGlowCount).toBeLessThanOrEqual(4);
    for (const universal of UNIVERSAL_GLOWS) {
      if (result.glows.includes(universal)) {
        expect(result.glows.indexOf(universal)).toBeGreaterThanOrEqual(skillGlowCount);
      }
    }
  });

  it("ignores unknown slugs without throwing", () => {
    const result = getSessionChips({ skillSlugs: ["totally-unknown-slug"] });
    expect(result.grows).toEqual([]);
    // Falls back to universal glows only.
    expect(result.glows).toEqual(UNIVERSAL_GLOWS);
  });

  it("returns universal glows only and no grows for an empty skill list", () => {
    const result = getSessionChips({ skillSlugs: [] });
    expect(result.glows).toEqual(UNIVERSAL_GLOWS);
    expect(result.grows).toEqual([]);
  });
});
