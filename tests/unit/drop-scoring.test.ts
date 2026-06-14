import { describe, it, expect } from "vitest";
import { computeTeamBonus, finalScore } from "@/lib/drop-league/scoring";
import type { PlayerWeek } from "@/lib/drop-league/scoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<PlayerWeek> & { playerId: string }): PlayerWeek {
  return {
    weekNumber: 2,
    currentWeightG: 90000,
    priorWeekWeightG: 91000,
    seasonStartWeightG: 95000,
    isMaintenance: false,
    priorWeeksLost: 0,
    hatTricksAwarded: 0,
    fivePctAwarded: false,
    tenPctAwarded: false,
    foodDiarySubmitted: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §6 CANONICAL EXAMPLE
// 6 players, all non-maintenance:
//   - P1 lost vs prior (plain)
//   - P2 lost vs prior (plain)
//   - P3 lost vs prior (plain)
//   - P4 lost vs prior AND pctLost >= 0.05 (!fivePctAwarded) → milestone +3
//   - P5 gained vs prior AND gained vs start → ownGoal
//   - P6 week-1 style but we use week 2 with priorWeekWeightG set; no loss
//     Actually spec says 4 lost, 1 milestone among those 4, 1 gainer.
//     Let's make P6 flat (no loss, no gain vs start).
//
// Concrete numbers:
//   teamBonusContributions = 4 * 0.5 = 2.0; cap = floor(6/2) = 3; → teamBonusGoals = 2
//   milestoneGoals = 3 (P4 crosses 5%)
//   hatTrickGoals = 0
//   ownGoals = 1 (P5)
//   foodDiaryGoals = 0
//   bonusGoalsTotal = 2 + 0 + 3 + 0 - 1 = 4
//   finalScore(2, bonus) = 2 + 4 = 6
// ---------------------------------------------------------------------------

describe("§6 canonical example", () => {
  // P1-P3: lost vs prior. Their pctLost is already >= 0.05 from prior weeks,
  // so fivePctAwarded=true — milestone won't fire again this week.
  //   pctLost P1 = (95000-89000)/95000 ≈ 0.063 → already awarded
  //   pctLost P2 = (95000-88000)/95000 ≈ 0.074 → already awarded
  //   pctLost P3 = (95000-87000)/95000 ≈ 0.084 → already awarded
  const P1 = makePlayer({ playerId: "p1", currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000, priorWeeksLost: 0, fivePctAwarded: true });
  const P2 = makePlayer({ playerId: "p2", currentWeightG: 88000, priorWeekWeightG: 89000, seasonStartWeightG: 95000, priorWeeksLost: 0, fivePctAwarded: true });
  const P3 = makePlayer({ playerId: "p3", currentWeightG: 87000, priorWeekWeightG: 88000, seasonStartWeightG: 95000, priorWeeksLost: 0, fivePctAwarded: true });
  // P4: lost vs prior AND pctLost = (95000 - 90250) / 95000 = 4750/95000 = 0.05 exactly
  // fivePctAwarded=false → newly crosses 5% this week → +3 milestoneGoals
  const P4 = makePlayer({ playerId: "p4", currentWeightG: 90250, priorWeekWeightG: 91000, seasonStartWeightG: 95000, priorWeeksLost: 0, fivePctAwarded: false });
  // P5: gained vs prior AND gained vs start → ownGoal
  const P5 = makePlayer({ playerId: "p5", currentWeightG: 96000, priorWeekWeightG: 95000, seasonStartWeightG: 95000, priorWeeksLost: 0 });
  // P6: no loss, no gain vs start (flat / below start but no loss)
  const P6 = makePlayer({ playerId: "p6", currentWeightG: 91000, priorWeekWeightG: 91000, seasonStartWeightG: 95000, priorWeeksLost: 0 });

  const players = [P1, P2, P3, P4, P5, P6];

  it("produces bonusGoalsTotal === 4", () => {
    const bonus = computeTeamBonus(players);
    expect(bonus.teamBonusGoals).toBe(2);
    expect(bonus.milestoneGoals).toBe(3);
    expect(bonus.hatTrickGoals).toBe(0);
    expect(bonus.ownGoals).toBe(1);
    expect(bonus.foodDiaryGoals).toBe(0);
    expect(bonus.bonusGoalsTotal).toBe(4);
  });

  it("finalScore(2, bonus) === 6", () => {
    const bonus = computeTeamBonus(players);
    expect(finalScore(2, bonus)).toBe(6);
  });

  it("P4 fivePctNewlyAwarded is true", () => {
    const bonus = computeTeamBonus(players);
    const p4bd = bonus.perPlayer.find((b) => b.playerId === "p4");
    expect(p4bd?.fivePctNewlyAwarded).toBe(true);
  });

  it("P5 ownGoal is true", () => {
    const bonus = computeTeamBonus(players);
    const p5bd = bonus.perPlayer.find((b) => b.playerId === "p5");
    expect(p5bd?.ownGoal).toBe(true);
  });

  it("P1-P4 lostVsPrior is true", () => {
    const bonus = computeTeamBonus(players);
    for (const id of ["p1", "p2", "p3", "p4"]) {
      expect(bonus.perPlayer.find((b) => b.playerId === id)?.lostVsPrior).toBe(true);
    }
  });

  it("P5 and P6 lostVsPrior is false", () => {
    const bonus = computeTeamBonus(players);
    expect(bonus.perPlayer.find((b) => b.playerId === "p5")?.lostVsPrior).toBe(false);
    expect(bonus.perPlayer.find((b) => b.playerId === "p6")?.lostVsPrior).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — Team weight-loss bonus
// ---------------------------------------------------------------------------

describe("rule 1 — team bonus", () => {
  it("all 6 players lose → teamBonusGoals === 3 (cap = floor(6/2))", () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 })
    );
    const bonus = computeTeamBonus(players);
    // 6 * 0.5 = 3.0 → cap floor(6/2)=3 → 3
    expect(bonus.teamBonusGoals).toBe(3);
  });

  it("5 of 6 players lose → teamBonusGoals === 2.5 (fractional, below cap 3)", () => {
    // 5 * 0.5 = 2.5; cap = 3; absolute cap 5; result = 2.5
    const losers = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 })
    );
    const flat = makePlayer({ playerId: "p5", currentWeightG: 90000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 });
    const bonus = computeTeamBonus([...losers, flat]);
    expect(bonus.teamBonusGoals).toBe(2.5);
  });

  it("large roster: absolute cap 5 applies", () => {
    // 20 players all lose → 20 * 0.5 = 10; cap floor(20/2)=10; absolute cap 5
    const players = Array.from({ length: 20 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.teamBonusGoals).toBe(5);
  });

  it("roster cap dominates when floor(n/2) < sum", () => {
    // 4 players all lose → 4 * 0.5 = 2.0; cap floor(4/2) = 2; absolute cap 5
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.teamBonusGoals).toBe(2);
  });

  it("maintenance player not gaining contributes 1.0", () => {
    // 1 maintenance player (no gain), 1 non-maintenance loser
    // sum = 1.0 + 0.5 = 1.5; cap floor(2/2) = 1; result = 1
    const maint = makePlayer({
      playerId: "m1",
      isMaintenance: true,
      currentWeightG: 90000,
      priorWeekWeightG: 90000, // flat — not gaining
      seasonStartWeightG: 95000,
    });
    const loser = makePlayer({ playerId: "p1", currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000 });
    const bonus = computeTeamBonus([maint, loser]);
    expect(bonus.teamBonusGoals).toBe(1);
  });

  it("maintenance player with null prior contributes 1.0 (not gaining)", () => {
    const maint = makePlayer({
      playerId: "m1",
      isMaintenance: true,
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 90000,
      seasonStartWeightG: 90000,
    });
    const bonus = computeTeamBonus([maint]);
    // sum = 1.0; cap floor(1/2)=0; teamBonusGoals = 0 (cap at 0)
    expect(bonus.teamBonusGoals).toBe(0);
  });

  it("maintenance player gaining contributes 0", () => {
    // isMaintenance=true, currentWeight > priorWeight → gainedVsPrior → contributes 0
    const maint = makePlayer({
      playerId: "m1",
      isMaintenance: true,
      currentWeightG: 91000, // gained vs prior
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
    });
    const bonus = computeTeamBonus([maint]);
    expect(bonus.teamBonusGoals).toBe(0);
  });

  it("non-maintenance no-loss contributes 0", () => {
    const flat = makePlayer({
      playerId: "p1",
      currentWeightG: 90000,
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
    });
    const bonus = computeTeamBonus([flat]);
    expect(bonus.teamBonusGoals).toBe(0);
  });

  it("week 1 (null prior) non-maintenance contributes 0 to team bonus", () => {
    const p1 = makePlayer({
      playerId: "p1",
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 90000,
      seasonStartWeightG: 91000,
    });
    const bonus = computeTeamBonus([p1]);
    expect(bonus.teamBonusGoals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Hat-trick
// ---------------------------------------------------------------------------

describe("rule 2 — hat-trick", () => {
  it("priorWeeksLost=2 + lost this week → hat-trick awarded, +1 goal", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 89000,
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
      priorWeeksLost: 2,
      hatTricksAwarded: 0,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(1);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.hatTrickAwarded).toBe(true);
  });

  it("priorWeeksLost=5 + lost this week → hat-trick awarded (5+1=6, 6%3=0)", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 89000,
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
      priorWeeksLost: 5,
      hatTricksAwarded: 1,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(1);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.hatTrickAwarded).toBe(true);
  });

  it("priorWeeksLost=2 but hatTricksAwarded=4 (cap) → no hat-trick", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 89000,
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
      priorWeeksLost: 2,
      hatTricksAwarded: 4,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.hatTrickAwarded).toBe(false);
  });

  it("priorWeeksLost=1 (not a multiple of 3 after +1) → no hat-trick", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 89000,
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
      priorWeeksLost: 1,
      hatTricksAwarded: 0,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.hatTrickAwarded).toBe(false);
  });

  it("no loss → no hat-trick even if priorWeeksLost=2", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 90000, // flat, no loss
      priorWeekWeightG: 90000,
      seasonStartWeightG: 95000,
      priorWeeksLost: 2,
      hatTricksAwarded: 0,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.hatTrickAwarded).toBe(false);
  });

  it("week 1 (null prior) → no hat-trick regardless of priorWeeksLost", () => {
    const p = makePlayer({
      playerId: "p1",
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 90000,
      seasonStartWeightG: 91000,
      priorWeeksLost: 2,
      hatTricksAwarded: 0,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.hatTrickGoals).toBe(0);
  });

  it("two players both earn hat-tricks in same week → hatTrickGoals === 2", () => {
    const p1 = makePlayer({ playerId: "p1", currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000, priorWeeksLost: 2, hatTricksAwarded: 0 });
    const p2 = makePlayer({ playerId: "p2", currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000, priorWeeksLost: 2, hatTricksAwarded: 0 });
    const bonus = computeTeamBonus([p1, p2]);
    expect(bonus.hatTrickGoals).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — 5% milestone
// ---------------------------------------------------------------------------

describe("rule 3 — 5% milestone", () => {
  it("pctLost >= 0.05 and !fivePctAwarded → +3 milestoneGoals, fivePctNewlyAwarded=true", () => {
    // pctLost = (95000 - 90250) / 95000 = 4750/95000 = 0.05 exactly
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 90250,
      priorWeekWeightG: 91000,
      seasonStartWeightG: 95000,
      fivePctAwarded: false,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(3);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(true);
  });

  it("fivePctAwarded=true → no milestone goal even if pctLost >= 0.05", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 90250,
      priorWeekWeightG: 91000,
      seasonStartWeightG: 95000,
      fivePctAwarded: true,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(false);
  });

  it("pctLost < 0.05 → no milestone", () => {
    // pctLost = (95000 - 91000) / 95000 ≈ 0.042
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 91000,
      priorWeekWeightG: 92000,
      seasonStartWeightG: 95000,
      fivePctAwarded: false,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — 10% milestone
// ---------------------------------------------------------------------------

describe("rule 4 — 10% milestone", () => {
  it("pctLost >= 0.10 and !tenPctAwarded → +3 milestoneGoals, tenPctNewlyAwarded=true", () => {
    // pctLost = (95000 - 85500) / 95000 = 9500/95000 = 0.10 exactly
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 85500,
      priorWeekWeightG: 86000,
      seasonStartWeightG: 95000,
      fivePctAwarded: true,  // already awarded
      tenPctAwarded: false,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(3);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.tenPctNewlyAwarded).toBe(true);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(false);
  });

  it("tenPctAwarded=true → no milestone even if pctLost >= 0.10", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 85500,
      priorWeekWeightG: 86000,
      seasonStartWeightG: 95000,
      fivePctAwarded: true,
      tenPctAwarded: true,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.tenPctNewlyAwarded).toBe(false);
  });

  it("both 5% and 10% newly crossed (both flags false, pctLost >= 0.10) → +6 milestoneGoals", () => {
    // Both fivePctAwarded and tenPctAwarded are false, and pctLost >= 0.10
    // pctLost = (95000 - 85500) / 95000 = 0.10 exactly → ≥ 0.05 AND ≥ 0.10
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 85500,
      priorWeekWeightG: 86000,
      seasonStartWeightG: 95000,
      fivePctAwarded: false,
      tenPctAwarded: false,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(6);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(true);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.tenPctNewlyAwarded).toBe(true);
  });

  it("multiple players each crossing 5% → milestoneGoals sums correctly (+3 each)", () => {
    const p1 = makePlayer({ playerId: "p1", currentWeightG: 90250, priorWeekWeightG: 91000, seasonStartWeightG: 95000, fivePctAwarded: false });
    const p2 = makePlayer({ playerId: "p2", currentWeightG: 90250, priorWeekWeightG: 91000, seasonStartWeightG: 95000, fivePctAwarded: false });
    const bonus = computeTeamBonus([p1, p2]);
    expect(bonus.milestoneGoals).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — Food diary
// ---------------------------------------------------------------------------

describe("rule 5 — food diary", () => {
  it("0 submitters → foodDiaryGoals === 0", () => {
    const players = Array.from({ length: 3 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, foodDiarySubmitted: false })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.foodDiaryGoals).toBe(0);
  });

  it("1 submitter → foodDiaryGoals === 1 (ceil(1/3))", () => {
    const p1 = makePlayer({ playerId: "p1", foodDiarySubmitted: true });
    const p2 = makePlayer({ playerId: "p2", foodDiarySubmitted: false });
    const bonus = computeTeamBonus([p1, p2]);
    expect(bonus.foodDiaryGoals).toBe(1);
  });

  it("3 submitters → foodDiaryGoals === 1 (ceil(3/3))", () => {
    const players = Array.from({ length: 3 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, foodDiarySubmitted: true })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.foodDiaryGoals).toBe(1);
  });

  it("4 submitters → foodDiaryGoals === 2 (ceil(4/3))", () => {
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, foodDiarySubmitted: true })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.foodDiaryGoals).toBe(2);
  });

  it("6 submitters → foodDiaryGoals === 2 (ceil(6/3))", () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, foodDiarySubmitted: true })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.foodDiaryGoals).toBe(2);
  });

  it("7 submitters → foodDiaryGoals === 3 (ceil(7/3))", () => {
    const players = Array.from({ length: 7 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, foodDiarySubmitted: true })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.foodDiaryGoals).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — Own goal
// ---------------------------------------------------------------------------

describe("rule 6 — own goal", () => {
  it("gained vs prior AND gained vs start → ownGoal: true, ownGoals +1", () => {
    // currentWeightG > priorWeekWeightG AND currentWeightG > seasonStartWeightG
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 96000,
      priorWeekWeightG: 95000,
      seasonStartWeightG: 95000,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.ownGoals).toBe(1);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.ownGoal).toBe(true);
  });

  it("gained vs prior but still below season start → no own goal", () => {
    // current > prior but current < start → gainedVsPriorAndStart = false
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 90000,
      priorWeekWeightG: 89000, // gained vs prior
      seasonStartWeightG: 95000, // but still below start
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.ownGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.ownGoal).toBe(false);
  });

  it("gained vs prior and equal to season start → no own goal (must be strictly greater than start)", () => {
    // current == seasonStart → not > seasonStart → no own goal
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 95000,
      priorWeekWeightG: 94000, // gained vs prior
      seasonStartWeightG: 95000, // equal to start, not above
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.ownGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.ownGoal).toBe(false);
  });

  it("week 1 (null prior) → no own goal even if current > start", () => {
    const p = makePlayer({
      playerId: "p1",
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 96000,
      seasonStartWeightG: 95000,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.ownGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.ownGoal).toBe(false);
  });

  it("multiple own goals in one week sum correctly", () => {
    const p1 = makePlayer({ playerId: "p1", currentWeightG: 96000, priorWeekWeightG: 95000, seasonStartWeightG: 95000 });
    const p2 = makePlayer({ playerId: "p2", currentWeightG: 97000, priorWeekWeightG: 96000, seasonStartWeightG: 95000 });
    const bonus = computeTeamBonus([p1, p2]);
    expect(bonus.ownGoals).toBe(2);
  });

  it("lost vs prior → no own goal", () => {
    const p = makePlayer({
      playerId: "p1",
      currentWeightG: 89000,
      priorWeekWeightG: 90000, // lost vs prior
      seasonStartWeightG: 95000,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.ownGoals).toBe(0);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.ownGoal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Week 1 (null prior) — comprehensive
// ---------------------------------------------------------------------------

describe("week 1 — null priorWeekWeightG", () => {
  it("non-maintenance player: no team bonus, no hat-trick, no own goal", () => {
    const p = makePlayer({
      playerId: "p1",
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 90000,
      seasonStartWeightG: 91000,
      priorWeeksLost: 0,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.teamBonusGoals).toBe(0);
    expect(bonus.hatTrickGoals).toBe(0);
    expect(bonus.ownGoals).toBe(0);
  });

  it("week 1 with pctLost >= 0.05 → milestone still fires (based on seasonStart not prior)", () => {
    // pctLost = (100000 - 94000) / 100000 = 0.06 >= 0.05
    const p = makePlayer({
      playerId: "p1",
      weekNumber: 1,
      priorWeekWeightG: null,
      currentWeightG: 94000,
      seasonStartWeightG: 100000,
      fivePctAwarded: false,
    });
    const bonus = computeTeamBonus([p]);
    expect(bonus.milestoneGoals).toBe(3);
    expect(bonus.perPlayer.find((b) => b.playerId === "p1")?.fivePctNewlyAwarded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bonusGoalsTotal — integrated
// ---------------------------------------------------------------------------

describe("bonusGoalsTotal — integrated", () => {
  it("zero-activity team → bonusGoalsTotal === 0", () => {
    // week 1, no prior, currentWeight == seasonStart → pctLost = 0, no milestones
    const players = Array.from({ length: 4 }, (_, i) =>
      makePlayer({ playerId: `p${i}`, weekNumber: 1, priorWeekWeightG: null, currentWeightG: 95000, seasonStartWeightG: 95000 })
    );
    const bonus = computeTeamBonus(players);
    expect(bonus.bonusGoalsTotal).toBe(0);
  });

  it("bonusGoalsTotal can go negative if ownGoals > other bonuses", () => {
    // 1 player: gains vs prior AND vs start → ownGoals=1; no other bonuses
    const p = makePlayer({ playerId: "p1", currentWeightG: 96000, priorWeekWeightG: 95000, seasonStartWeightG: 95000 });
    const bonus = computeTeamBonus([p]);
    expect(bonus.bonusGoalsTotal).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// finalScore
// ---------------------------------------------------------------------------

describe("finalScore", () => {
  it("adds pitchScore and bonusGoalsTotal", () => {
    // 1 player: lost vs prior, but fivePctAwarded=true (no milestone), no hat-trick,
    // no own goal. teamBonusGoals = min(0.5, floor(1/2)=0, 5) = 0. bonusGoalsTotal=0.
    const bonus = computeTeamBonus([
      makePlayer({ playerId: "p1", currentWeightG: 89000, priorWeekWeightG: 90000, seasonStartWeightG: 95000, fivePctAwarded: true }),
    ]);
    expect(finalScore(5, bonus)).toBe(5);
  });

  it("handles zero pitch score", () => {
    const bonus = computeTeamBonus([]);
    expect(finalScore(0, bonus)).toBe(0);
  });

  it("applies negative bonus correctly", () => {
    const p = makePlayer({ playerId: "p1", currentWeightG: 96000, priorWeekWeightG: 95000, seasonStartWeightG: 95000 });
    const bonus = computeTeamBonus([p]);
    expect(finalScore(3, bonus)).toBe(2); // 3 + (-1) = 2
  });
});
