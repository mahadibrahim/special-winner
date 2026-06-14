export interface MatchRow {
  homeTeamId: string;
  awayTeamId: string;
  homeFinalScore: number;
  awayFinalScore: number;
  homeBonusGoals: number;
  awayBonusGoals: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  bonusGoals: number;
  totalGoals: number;
}

/**
 * Compute a league standings table from a set of final matches.
 *
 * Rules:
 *   - Win  (homeFinalScore > awayFinalScore): 3 pts to winner, 0 to loser
 *   - Draw (homeFinalScore === awayFinalScore): 1 pt each
 *   - Loss: 0 pts
 *   - bonusGoals: the team's own bonus-goal contribution in each match
 *   - totalGoals: the team's own final score in each match
 *
 * All teamIds in the supplied array appear in the result, even teams with
 * no matches (they get all-zero rows).
 *
 * Sort order: points desc → totalGoals desc → bonusGoals desc (stable).
 */
export function computeStandings(teamIds: string[], matches: MatchRow[]): StandingRow[] {
  // Initialise a zeroed row for every team.
  const map = new Map<string, StandingRow>();
  for (const teamId of teamIds) {
    map.set(teamId, { teamId, played: 0, won: 0, drawn: 0, lost: 0, points: 0, bonusGoals: 0, totalGoals: 0 });
  }

  for (const m of matches) {
    const home = map.get(m.homeTeamId);
    const away = map.get(m.awayTeamId);

    if (home) {
      home.played += 1;
      home.totalGoals += m.homeFinalScore;
      home.bonusGoals += m.homeBonusGoals;
      if (m.homeFinalScore > m.awayFinalScore) {
        home.won += 1;
        home.points += 3;
      } else if (m.homeFinalScore === m.awayFinalScore) {
        home.drawn += 1;
        home.points += 1;
      } else {
        home.lost += 1;
      }
    }

    if (away) {
      away.played += 1;
      away.totalGoals += m.awayFinalScore;
      away.bonusGoals += m.awayBonusGoals;
      if (m.awayFinalScore > m.homeFinalScore) {
        away.won += 1;
        away.points += 3;
      } else if (m.awayFinalScore === m.homeFinalScore) {
        away.drawn += 1;
        away.points += 1;
      } else {
        away.lost += 1;
      }
    }
  }

  const rows = Array.from(map.values());

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.totalGoals !== a.totalGoals) return b.totalGoals - a.totalGoals;
    return b.bonusGoals - a.bonusGoals;
  });

  return rows;
}
