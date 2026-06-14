/**
 * Drop League bonus-goal scoring engine.
 *
 * All weights are in grams (integers). Computes "Drop Goals" for ONE team
 * for ONE week. Pure function — no I/O, no side-effects.
 */

export interface PlayerWeek {
  playerId: string;
  weekNumber: number; // 1-based
  currentWeightG: number;
  priorWeekWeightG: number | null; // null in week 1
  seasonStartWeightG: number;
  isMaintenance: boolean; // reached healthy BMI → maintenance scoring
  priorWeeksLost: number; // count of EARLIER weeks this player lost (for hat-trick)
  hatTricksAwarded: number; // hat-tricks already awarded this season (cap 4)
  fivePctAwarded: boolean;
  tenPctAwarded: boolean;
  foodDiarySubmitted: boolean; // submitted + coach-confirmed this week
}

export interface PlayerBreakdown {
  playerId: string;
  lostVsPrior: boolean;
  hatTrickAwarded: boolean;
  fivePctNewlyAwarded: boolean;
  tenPctNewlyAwarded: boolean;
  ownGoal: boolean;
}

export interface TeamBonus {
  teamBonusGoals: number;
  hatTrickGoals: number;
  milestoneGoals: number;
  foodDiaryGoals: number;
  ownGoals: number;
  bonusGoalsTotal: number;
  perPlayer: PlayerBreakdown[];
}

export function computeTeamBonus(players: PlayerWeek[]): TeamBonus {
  const rosterSize = players.length;

  let teamBonusContributions = 0;
  let hatTrickGoals = 0;
  let milestoneGoals = 0;
  let ownGoals = 0;
  const perPlayer: PlayerBreakdown[] = [];

  for (const p of players) {
    // -----------------------------------------------------------------------
    // Per-player derivations
    // -----------------------------------------------------------------------
    const lostVsPrior =
      p.priorWeekWeightG !== null && p.currentWeightG < p.priorWeekWeightG;

    const gainedVsPriorAndStart =
      p.priorWeekWeightG !== null &&
      p.currentWeightG > p.priorWeekWeightG &&
      p.currentWeightG > p.seasonStartWeightG;

    const pctLost =
      (p.seasonStartWeightG - p.currentWeightG) / p.seasonStartWeightG;

    // -----------------------------------------------------------------------
    // Rule 1 — team bonus contribution (per player)
    // -----------------------------------------------------------------------
    if (p.isMaintenance) {
      // maintenance: not gaining (null prior OR current <= prior) → 1.0
      const notGaining =
        p.priorWeekWeightG === null || p.currentWeightG <= p.priorWeekWeightG;
      if (notGaining) {
        teamBonusContributions += 1.0;
      }
    } else {
      // non-maintenance: lost vs prior → 0.5
      if (lostVsPrior) {
        teamBonusContributions += 0.5;
      }
    }

    // -----------------------------------------------------------------------
    // Rule 2 — hat-trick
    // -----------------------------------------------------------------------
    let hatTrickAwarded = false;
    if (
      lostVsPrior &&
      (p.priorWeeksLost + 1) % 3 === 0 &&
      p.hatTricksAwarded < 4
    ) {
      hatTrickGoals += 1;
      hatTrickAwarded = true;
    }

    // -----------------------------------------------------------------------
    // Rule 3 — 5% milestone
    // -----------------------------------------------------------------------
    let fivePctNewlyAwarded = false;
    if (!p.fivePctAwarded && pctLost >= 0.05) {
      milestoneGoals += 3;
      fivePctNewlyAwarded = true;
    }

    // -----------------------------------------------------------------------
    // Rule 4 — 10% milestone
    // -----------------------------------------------------------------------
    let tenPctNewlyAwarded = false;
    if (!p.tenPctAwarded && pctLost >= 0.1) {
      milestoneGoals += 3;
      tenPctNewlyAwarded = true;
    }

    // -----------------------------------------------------------------------
    // Rule 6 — weight-gain own goal (per player)
    // -----------------------------------------------------------------------
    let ownGoal = false;
    if (gainedVsPriorAndStart) {
      ownGoals += 1;
      ownGoal = true;
    }

    perPlayer.push({
      playerId: p.playerId,
      lostVsPrior,
      hatTrickAwarded,
      fivePctNewlyAwarded,
      tenPctNewlyAwarded,
      ownGoal,
    });
  }

  // -------------------------------------------------------------------------
  // Rule 1 — apply caps to team bonus
  // -------------------------------------------------------------------------
  const rosterCap = Math.floor(rosterSize / 2);
  const teamBonusGoals = Math.min(teamBonusContributions, rosterCap, 5);

  // -------------------------------------------------------------------------
  // Rule 5 — food diary (team)
  // -------------------------------------------------------------------------
  const trackers = players.filter((p) => p.foodDiarySubmitted).length;
  const foodDiaryGoals = trackers === 0 ? 0 : Math.ceil(trackers / 3);

  // -------------------------------------------------------------------------
  // Total
  // -------------------------------------------------------------------------
  const bonusGoalsTotal =
    teamBonusGoals + hatTrickGoals + milestoneGoals + foodDiaryGoals - ownGoals;

  return {
    teamBonusGoals,
    hatTrickGoals,
    milestoneGoals,
    foodDiaryGoals,
    ownGoals,
    bonusGoalsTotal,
    perPlayer,
  };
}

export function finalScore(pitchScore: number, bonus: TeamBonus): number {
  return pitchScore + bonus.bonusGoalsTotal;
}
