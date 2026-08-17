// The youth level ladder exists because the term page previously hid levels
// entirely (showLevels={false}) — correct at the time, since LevelLadder
// rendered ADULT tiers ("Elite — played in college") to parents, but it meant a
// parent could not tell a Competitive A division from a Recreational one.
//
// These tests pin the two properties that make the youth ladder safe to show:
// it is driven by the shared vocabulary (so admin, DB and UI cannot drift), and
// it carries no strength ranking.
import { describe, it, expect } from "vitest";
import { YOUTH_SKILL_LEVELS } from "@/lib/leagues/youth-soccer-content";
import { YOUTH_LEVELS, DIVISION_LEVEL_LABEL } from "@/lib/leagues/division-filters";
import { SKILL_LEVELS } from "@/lib/leagues/adult-soccer-content";

describe("youth skill levels", () => {
  it("covers exactly the shared YOUTH_LEVELS vocabulary, in order", () => {
    expect(YOUTH_SKILL_LEVELS.map((l) => l.key)).toEqual([...YOUTH_LEVELS]);
  });

  it("takes its labels from the shared vocabulary rather than restating them", () => {
    for (const level of YOUTH_SKILL_LEVELS) {
      expect(level.label).toBe(DIVISION_LEVEL_LABEL[level.key]);
    }
  });

  it("gives every level a non-empty parent-facing description", () => {
    for (const level of YOUTH_SKILL_LEVELS) {
      expect(level.description.length).toBeGreaterThan(20);
    }
  });

  it("carries NO bar ranking — youth levels are tracks, not rungs", () => {
    // The adult ladder ranks 4/3/2/1. If a `bars` field ever appears on the
    // youth levels, someone has reintroduced a rating that tells a Recreational
    // parent their kid is bottom of four.
    for (const level of YOUTH_SKILL_LEVELS) {
      expect(level).not.toHaveProperty("bars");
    }
    // Guard the comparison itself: adult really does rank, so this test would
    // catch a refactor that flattened adult by accident.
    expect(SKILL_LEVELS.map((l) => l.bars)).toEqual([4, 3, 2, 1]);
  });

  it("makes no format, price or season-length claims", () => {
    // The whole redesign forbids format claims — a level description is a
    // tempting place for "9v9" or "$130" to sneak back in.
    const forbidden = [/\d+v\d+/i, /\$\s?\d/, /size [345]/i, /\d+\s*(?:-|\s)?(?:minute|min)\b/i];
    for (const level of YOUTH_SKILL_LEVELS) {
      for (const pattern of forbidden) {
        expect(level.description).not.toMatch(pattern);
      }
    }
  });

  it("keeps youth and adult level keys disjoint", () => {
    // division-filters.ts relies on this: a stored level identifies its own
    // audience, so no consumer has to join to programs.audience_type.
    const adultKeys = new Set(SKILL_LEVELS.map((l) => l.key as string));
    for (const level of YOUTH_SKILL_LEVELS) {
      expect(adultKeys.has(level.key)).toBe(false);
    }
  });
});
