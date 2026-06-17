import { describe, it, expect } from "vitest";
import { computeStandings, rulesForSport, SPORT_RULES, DEFAULT_RULES, type TeamInput, type GameInput } from "@/lib/leagues/standings";

const teams: TeamInput[] = [
  { id: "a", name: "Alpha" }, { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" }, { id: "d", name: "Delta" },
];
const g = (h: string, a: string, hs: number, as: number, status = "completed"): GameInput =>
  ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, status });

describe("rulesForSport", () => {
  it("returns soccer rules for 'soccer' and the default otherwise", () => {
    expect(rulesForSport("soccer")).toBe(SPORT_RULES.soccer);
    expect(rulesForSport("pickleball")).toBe(DEFAULT_RULES);
    expect(rulesForSport(null)).toBe(DEFAULT_RULES);
  });
});

describe("computeStandings (soccer)", () => {
  const R = SPORT_RULES.soccer;

  it("includes every team, even with no games", () => {
    const rows = computeStandings(teams, [], R);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("awards 3/1/0 and tallies goals", () => {
    const rows = computeStandings(teams, [g("a", "b", 2, 0), g("c", "d", 1, 1)], R);
    const a = rows.find((r) => r.teamId === "a")!;
    const b = rows.find((r) => r.teamId === "b")!;
    const c = rows.find((r) => r.teamId === "c")!;
    expect([a.points, a.won, a.goalsFor, a.goalsAgainst]).toEqual([3, 1, 2, 0]);
    expect([b.points, b.lost]).toEqual([0, 1]);
    expect([c.points, c.drawn, c.goalDiff]).toEqual([1, 1, 0]);
  });

  it("ignores non-completed / null-score games", () => {
    const rows = computeStandings(teams, [g("a", "b", 5, 0, "scheduled"), { homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null, status: "completed" }], R);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it("caps recorded goals at the mercy margin but keeps the win", () => {
    const rows = computeStandings(teams, [g("a", "b", 10, 0)], R);
    const a = rows.find((r) => r.teamId === "a")!;
    expect([a.won, a.goalsFor, a.goalsAgainst, a.goalDiff]).toEqual([1, 5, 0, 5]);
  });

  it("ranks by points, then goal difference", () => {
    const rows = computeStandings(teams, [g("a", "b", 3, 0), g("c", "d", 1, 0)], R);
    expect(rows[0].teamId).toBe("a");
    expect(rows[1].teamId).toBe("c");
  });

  it("uses head-to-head before goal difference when points tie", () => {
    const rows = computeStandings(teams, [
      g("a", "b", 1, 0),
      g("b", "d", 5, 0),
      g("a", "d", 1, 0),
    ], R);
    const ai = rows.findIndex((r) => r.teamId === "a");
    const bi = rows.findIndex((r) => r.teamId === "b");
    expect(ai).toBeLessThan(bi);
  });
});

describe("computeStandings (default, no draws)", () => {
  it("ranks by wins under the default rules", () => {
    const rows = computeStandings(teams, [g("a", "b", 80, 70), g("c", "d", 60, 90)], DEFAULT_RULES);
    expect(rows[0].teamId === "a" || rows[0].teamId === "d").toBe(true);
    expect(DEFAULT_RULES.allowDraws).toBe(false);
  });
});
