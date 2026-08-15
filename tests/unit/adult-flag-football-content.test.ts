import { describe, it, expect } from "vitest";
import { FORMAT_FACTS, RULE_SECTIONS, FAQ, WHY_4V4, DIVISION_CALLOUTS } from "@/lib/leagues/adult-flag-football-content";

describe("adult-flag-football-content", () => {
  it("states the 4v4 format and 8-game season", () => {
    const joined = FORMAT_FACTS.join(" ").toLowerCase();
    expect(joined).toContain("4v4");
    expect(joined).toContain("8-game");
    expect(joined).toContain("roster");
  });
  it("has rule sections covering the game, coed, conduct, roster", () => {
    expect(RULE_SECTIONS.length).toBeGreaterThanOrEqual(4);
    const titles = RULE_SECTIONS.map((s) => s.title.toLowerCase()).join(" ");
    expect(titles).toContain("coed");
    for (const s of RULE_SECTIONS) expect(s.items.length).toBeGreaterThanOrEqual(3);
  });
  it("bans QB runs and enforces the 7-second clock in the rules", () => {
    const allRules = RULE_SECTIONS.flatMap((s) => s.items).join(" ").toLowerCase();
    expect(allRules).toContain("7-second");
    expect(allRules).toMatch(/quarterback|qb/);
  });
  it("has FAQ entries and both division callouts", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(4);
    expect(DIVISION_CALLOUTS.map((d) => d.title.toLowerCase()).join(" ")).toMatch(/men/);
    expect(DIVISION_CALLOUTS.map((d) => d.title.toLowerCase()).join(" ")).toMatch(/coed/);
  });
  it("has 5-6 value props with valid tints", () => {
    expect(WHY_4V4.length).toBeGreaterThanOrEqual(5);
    for (const v of WHY_4V4) expect(["orange", "sage", "ochre"]).toContain(v.tint);
  });
});
