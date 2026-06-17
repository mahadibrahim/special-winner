// Sport-agnostic league standings, computed on-the-fly from completed games.
// Generalizes src/lib/drop-league/standings.ts to regular games + configurable rules.

export type TiebreakerKey = "headToHead" | "goalDiff" | "fewestConceded" | "wins" | "scored";

export type StandingsRules = {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  allowDraws: boolean;
  tiebreakers: TiebreakerKey[];
  mercyGoalCap?: number;
};

export const SPORT_RULES: Record<string, StandingsRules> = {
  soccer: {
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    allowDraws: true,
    tiebreakers: ["headToHead", "goalDiff", "fewestConceded", "wins", "scored"],
    mercyGoalCap: 5,
  },
};

export const DEFAULT_RULES: StandingsRules = {
  pointsWin: 1,
  pointsDraw: 0,
  pointsLoss: 0,
  allowDraws: false,
  tiebreakers: ["goalDiff", "wins", "scored"],
};

export function rulesForSport(slug: string | null | undefined): StandingsRules {
  return (slug && SPORT_RULES[slug]) || DEFAULT_RULES;
}

export type TeamInput = { id: string; name: string };
export type GameInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};
export type StandingRow = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

function isCounted(g: GameInput): boolean {
  return (
    g.status === "completed" &&
    g.homeTeamId != null &&
    g.awayTeamId != null &&
    g.homeScore != null &&
    g.awayScore != null
  );
}

function capMargin(winnerGoals: number, loserGoals: number, cap?: number): number {
  if (cap == null) return winnerGoals;
  return winnerGoals - loserGoals > cap ? loserGoals + cap : winnerGoals;
}

function headToHead(aId: string, bId: string, games: GameInput[], rules: StandingsRules): number {
  let aPts = 0;
  let bPts = 0;
  for (const g of games) {
    let aGoals: number;
    let bGoals: number;
    if (g.homeTeamId === aId && g.awayTeamId === bId) {
      aGoals = g.homeScore as number;
      bGoals = g.awayScore as number;
    } else if (g.homeTeamId === bId && g.awayTeamId === aId) {
      aGoals = g.awayScore as number;
      bGoals = g.homeScore as number;
    } else {
      continue;
    }
    if (aGoals > bGoals) {
      aPts += rules.pointsWin;
      bPts += rules.pointsLoss;
    } else if (bGoals > aGoals) {
      bPts += rules.pointsWin;
      aPts += rules.pointsLoss;
    } else {
      aPts += rules.pointsDraw;
      bPts += rules.pointsDraw;
    }
  }
  return bPts - aPts;
}

export function computeStandings(
  teams: TeamInput[],
  games: GameInput[],
  rules: StandingsRules,
): StandingRow[] {
  const map = new Map<string, StandingRow>();
  for (const t of teams) {
    map.set(t.id, {
      teamId: t.id, teamName: t.name, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
    });
  }

  const counted = games.filter(isCounted);
  for (const g of counted) {
    const home = map.get(g.homeTeamId as string);
    const away = map.get(g.awayTeamId as string);
    if (!home || !away) continue;
    const hs = g.homeScore as number;
    const as = g.awayScore as number;

    let recH = hs;
    let recA = as;
    if (hs > as) recH = capMargin(hs, as, rules.mercyGoalCap);
    else if (as > hs) recA = capMargin(as, hs, rules.mercyGoalCap);

    home.played += 1;
    away.played += 1;
    home.goalsFor += recH;
    home.goalsAgainst += recA;
    away.goalsFor += recA;
    away.goalsAgainst += recH;

    if (hs > as) {
      home.won += 1; home.points += rules.pointsWin;
      away.lost += 1; away.points += rules.pointsLoss;
    } else if (as > hs) {
      away.won += 1; away.points += rules.pointsWin;
      home.lost += 1; home.points += rules.pointsLoss;
    } else {
      home.drawn += 1; away.drawn += 1;
      home.points += rules.pointsDraw; away.points += rules.pointsDraw;
    }
  }

  for (const r of map.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;

  const rows = [...map.values()];
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const tb of rules.tiebreakers) {
      let d = 0;
      switch (tb) {
        case "goalDiff": d = b.goalDiff - a.goalDiff; break;
        case "fewestConceded": d = a.goalsAgainst - b.goalsAgainst; break;
        case "wins": d = b.won - a.won; break;
        case "scored": d = b.goalsFor - a.goalsFor; break;
        case "headToHead": d = headToHead(a.teamId, b.teamId, counted, rules); break;
      }
      if (d !== 0) return d;
    }
    return a.teamName.localeCompare(b.teamName);
  });
  return rows;
}
