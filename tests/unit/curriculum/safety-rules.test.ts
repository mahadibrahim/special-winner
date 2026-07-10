import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import { SKILL_SAFETY_RULES, getSafetyRule } from "@/lib/curriculum/safety-rules";

// Same jargon guard as reinforcement.test.ts -- this text renders directly
// on the admin blueprint UI ("Blocked: ... — <rule>"), so it must read as
// plain English, not curriculum-internal jargon or a raw slug.
const JARGON_BLACKLIST = [
  "LTAD",
  "ADM",
  "USSF",
  "stage",
  "domain",
  "slug",
];

function assertNoJargon(text: string, context: string) {
  const lower = text.toLowerCase();
  for (const term of JARGON_BLACKLIST) {
    expect(lower, `${context} contains blacklisted jargon "${term}": "${text}"`).not.toContain(
      term.toLowerCase(),
    );
  }
}

describe("SKILL_SAFETY_RULES", () => {
  const allSkillSlugs = new Set(CURRICULUM_CONTENT.skills.map((s) => s.slug));

  it("has at least one entry", () => {
    expect(Object.keys(SKILL_SAFETY_RULES).length).toBeGreaterThan(0);
  });

  it("has at least one heading-related entry", () => {
    const headingSlugs = Object.keys(SKILL_SAFETY_RULES).filter((slug) =>
      slug.toLowerCase().includes("heading"),
    );
    expect(headingSlugs.length).toBeGreaterThan(0);
  });

  it("every key exists as a skill slug in the curriculum registry", () => {
    for (const slug of Object.keys(SKILL_SAFETY_RULES)) {
      expect(allSkillSlugs.has(slug), `"${slug}" is not a known skill slug`).toBe(true);
    }
  });

  it("every rule has a positive integer minAge", () => {
    for (const [slug, rule] of Object.entries(SKILL_SAFETY_RULES)) {
      expect(Number.isInteger(rule.minAge), `${slug} minAge should be an integer`).toBe(true);
      expect(rule.minAge, `${slug} minAge should be positive`).toBeGreaterThan(0);
    }
  });

  it("every rule's text and source are non-empty and jargon-free for admin display", () => {
    for (const [slug, rule] of Object.entries(SKILL_SAFETY_RULES)) {
      expect(rule.rule.length, `${slug} rule text should be non-empty`).toBeGreaterThan(0);
      expect(rule.source.length, `${slug} source should be non-empty`).toBeGreaterThan(0);
      assertNoJargon(rule.rule, `${slug} rule`);
      assertNoJargon(rule.source, `${slug} source`);

      // No slug leakage -- the copy must read as plain English, not
      // reference internal identifiers.
      if (slug.includes("-")) {
        expect(rule.rule.toLowerCase()).not.toContain(slug.toLowerCase());
        expect(rule.source.toLowerCase()).not.toContain(slug.toLowerCase());
      }
    }
  });
});

describe("getSafetyRule", () => {
  it("returns the rule for a known slug", () => {
    const rule = getSafetyRule("heading-defensive");
    expect(rule).not.toBeNull();
    expect(rule?.minAge).toBe(11);
  });

  it("returns null for an unknown slug", () => {
    expect(getSafetyRule("not-a-real-skill-slug")).toBeNull();
  });
});
