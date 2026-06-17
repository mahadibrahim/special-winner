import { describe, it, expect } from "vitest";
import { SKILL_LEVELS, FORMAT_FACTS, RULE_SECTIONS, FAQ } from "@/lib/leagues/adult-soccer-content";

describe("adult-soccer-content", () => {
  it("defines the four skill levels A–D in order with bar counts", () => {
    expect(SKILL_LEVELS.map((l) => l.key)).toEqual(["a", "b", "c", "d"]);
    expect(SKILL_LEVELS.map((l) => l.bars)).toEqual([4, 3, 2, 1]);
    for (const l of SKILL_LEVELS) expect(l.description.length).toBeGreaterThan(10);
  });
  it("states 7-game season, no playoffs", () => {
    const joined = FORMAT_FACTS.join(" ").toLowerCase();
    expect(joined).toContain("7-game");
    expect(joined).toContain("no playoffs");
  });
  it("has rule sections and FAQ entries", () => {
    expect(RULE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    expect(FAQ.length).toBeGreaterThanOrEqual(3);
  });
});
