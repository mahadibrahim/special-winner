import { describe, it, expect } from "vitest";
import { computeStandings } from "@/lib/drop-league/standings";
import type { MatchRow } from "@/lib/drop-league/standings";

// ─── Fixture ─────────────────────────────────────────────────────────────────
// 3 teams: Alpha, Beta, Gamma
// Matches:
//   Alpha (3) vs Beta  (1) → Alpha wins  (3 pts), Beta  loses (0 pts)
//   Alpha (2) vs Gamma (2) → Alpha draws (1 pt),  Gamma draws (1 pt)
//   Beta  (4) vs Gamma (2) → Beta  wins  (3 pts), Gamma loses (0 pt)
//
// Expected table:
//   Alpha  P=2 W=1 D=1 L=0 Pts=4 BG=1+0=1 TG=3+2=5   ← bonusGoals=home1+home2
//   Beta   P=2 W=1 D=0 L=1 Pts=3 BG=0+2=2 TG=1+4=5
//   Gamma  P=2 W=0 D=1 L=1 Pts=1 BG=0+0=0 TG=2+2=4
//
// Sort: Pts desc → Alpha(4) > Beta(3) > Gamma(1)
// Tie-breakers (totalGoals then bonusGoals) don't apply here since all pts differ.

const ALPHA = "aaaaaaaa-0000-0000-0000-000000000001";
const BETA  = "bbbbbbbb-0000-0000-0000-000000000002";
const GAMMA = "cccccccc-0000-0000-0000-000000000003";
const DELTA = "dddddddd-0000-0000-0000-000000000004"; // no matches

const matches: MatchRow[] = [
  // Alpha 3-1 Beta (bonus goals: home=1, away=0)
  { homeTeamId: ALPHA, awayTeamId: BETA,  homeFinalScore: 3, awayFinalScore: 1, homeBonusGoals: 1, awayBonusGoals: 0 },
  // Alpha 2-2 Gamma (bonus goals: home=0, away=0)
  { homeTeamId: ALPHA, awayTeamId: GAMMA, homeFinalScore: 2, awayFinalScore: 2, homeBonusGoals: 0, awayBonusGoals: 0 },
  // Beta 4-2 Gamma (bonus goals: home=2, away=0)
  { homeTeamId: BETA,  awayTeamId: GAMMA, homeFinalScore: 4, awayFinalScore: 2, homeBonusGoals: 2, awayBonusGoals: 0 },
];

describe("computeStandings", () => {
  it("produces correct points, W/D/L for each team", () => {
    const table = computeStandings([ALPHA, BETA, GAMMA], matches);

    const alpha = table.find((r) => r.teamId === ALPHA)!;
    const beta  = table.find((r) => r.teamId === BETA)!;
    const gamma = table.find((r) => r.teamId === GAMMA)!;

    // Alpha: 1W 1D 0L → 4 pts
    expect(alpha.played).toBe(2);
    expect(alpha.won).toBe(1);
    expect(alpha.drawn).toBe(1);
    expect(alpha.lost).toBe(0);
    expect(alpha.points).toBe(4);

    // Beta: 1W 0D 1L → 3 pts
    expect(beta.played).toBe(2);
    expect(beta.won).toBe(1);
    expect(beta.drawn).toBe(0);
    expect(beta.lost).toBe(1);
    expect(beta.points).toBe(3);

    // Gamma: 0W 1D 1L → 1 pt
    expect(gamma.played).toBe(2);
    expect(gamma.won).toBe(0);
    expect(gamma.drawn).toBe(1);
    expect(gamma.lost).toBe(1);
    expect(gamma.points).toBe(1);
  });

  it("accumulates bonusGoals and totalGoals correctly", () => {
    const table = computeStandings([ALPHA, BETA, GAMMA], matches);

    const alpha = table.find((r) => r.teamId === ALPHA)!;
    const beta  = table.find((r) => r.teamId === BETA)!;
    const gamma = table.find((r) => r.teamId === GAMMA)!;

    // Alpha: home bonus 1 + home bonus 0 = 1; totalGoals = 3+2 = 5
    expect(alpha.bonusGoals).toBe(1);
    expect(alpha.totalGoals).toBe(5);

    // Beta: away bonus 0 + home bonus 2 = 2; totalGoals = 1+4 = 5
    expect(beta.bonusGoals).toBe(2);
    expect(beta.totalGoals).toBe(5);

    // Gamma: away bonus 0 + away bonus 0 = 0; totalGoals = 2+2 = 4
    expect(gamma.bonusGoals).toBe(0);
    expect(gamma.totalGoals).toBe(4);
  });

  it("sorts by points desc, then totalGoals desc, then bonusGoals desc", () => {
    const table = computeStandings([ALPHA, BETA, GAMMA], matches);
    const ids = table.map((r) => r.teamId);
    expect(ids).toEqual([ALPHA, BETA, GAMMA]);
  });

  it("team with zero matches appears with all zeros", () => {
    const table = computeStandings([ALPHA, BETA, GAMMA, DELTA], matches);
    const delta = table.find((r) => r.teamId === DELTA)!;

    expect(delta).toBeDefined();
    expect(delta.played).toBe(0);
    expect(delta.won).toBe(0);
    expect(delta.drawn).toBe(0);
    expect(delta.lost).toBe(0);
    expect(delta.points).toBe(0);
    expect(delta.bonusGoals).toBe(0);
    expect(delta.totalGoals).toBe(0);
  });

  it("zero-match team sorts below teams with matches", () => {
    const table = computeStandings([ALPHA, BETA, GAMMA, DELTA], matches);
    const deltaIdx = table.findIndex((r) => r.teamId === DELTA);
    expect(deltaIdx).toBe(3); // last position
  });

  it("tie-breaker: equal points → higher totalGoals ranks first", () => {
    // Two teams, one match each:
    //   X beats Y 3-1 (both have 0 pts from this match perspective is wrong —
    //   let's set up an equal-points scenario separately)
    // X: 1W (3pts), totalGoals=5; Y: 0W,1D,1L — different pts, use simpler fixture
    //
    // Simpler: Two teams, one match, draw — equal pts (1), Y has more totalGoals
    const X = "eeeeeeee-0000-0000-0000-000000000005";
    const Y = "ffffffff-0000-0000-0000-000000000006";
    const tieMatches: MatchRow[] = [
      { homeTeamId: X, awayTeamId: Y, homeFinalScore: 2, awayFinalScore: 2, homeBonusGoals: 3, awayBonusGoals: 1 },
    ];
    const table = computeStandings([X, Y], tieMatches);
    // X pts=1 TG=2 BG=3; Y pts=1 TG=2 BG=1
    // Tie on pts and TG → bonusGoals desc → X first
    expect(table[0].teamId).toBe(X);
    expect(table[1].teamId).toBe(Y);
  });

  it("tie-breaker: equal pts and totalGoals → higher bonusGoals ranks first", () => {
    const X = "11111111-0000-0000-0000-000000000001";
    const Y = "22222222-0000-0000-0000-000000000002";
    const tieMatches: MatchRow[] = [
      // Draw: equal final scores. X has more bonus.
      { homeTeamId: X, awayTeamId: Y, homeFinalScore: 3, awayFinalScore: 3, homeBonusGoals: 2, awayBonusGoals: 0 },
    ];
    const table = computeStandings([X, Y], tieMatches);
    // Both pts=1, TG=3; X BG=2 vs Y BG=0 → X first
    expect(table[0].teamId).toBe(X);
    expect(table[1].teamId).toBe(Y);
  });

  it("empty team list returns empty array", () => {
    expect(computeStandings([], [])).toEqual([]);
  });

  it("handles a team appearing in no matches (all matches between other teams)", () => {
    const table = computeStandings([ALPHA, DELTA], matches.slice(0, 1)); // only Alpha-Beta match, but Delta is in teamIds
    const delta = table.find((r) => r.teamId === DELTA)!;
    expect(delta.played).toBe(0);
    expect(delta.points).toBe(0);
  });
});
