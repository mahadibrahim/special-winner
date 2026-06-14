/**
 * match-result.ts
 *
 * Builds the PlayerWeek[] for one team's side of a match by deriving ALL
 * season-to-date counters purely from the weigh-in history and static player
 * fields.  No mutable counters on dropPlayers are read, so calling this
 * multiple times for the same (team, week) always produces identical results —
 * finalize is fully idempotent.
 *
 * Players who have no weigh-in for the target week are EXCLUDED (no weigh-in
 * = no play).
 */

import { eq, and, lte } from "drizzle-orm";
import { dropPlayers, dropWeighIns, dropFoodDiary } from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import type { PlayerWeek } from "@/lib/drop-league/scoring";

interface BuildPlayerWeeksArgs {
  dropSeasonId: string;
  dropTeamId: string;
  weekNumber: number;
}

export async function buildPlayerWeeks(
  db: Database,
  { dropSeasonId, dropTeamId, weekNumber }: BuildPlayerWeeksArgs
): Promise<PlayerWeek[]> {
  // 1. Load all players on the team for this season (sequential — pool is max:1)
  const players = await db
    .select({
      id: dropPlayers.id,
      seasonStartWeightG: dropPlayers.seasonStartWeightG,
      maintenanceStatus: dropPlayers.maintenanceStatus,
    })
    .from(dropPlayers)
    .where(
      and(
        eq(dropPlayers.dropSeasonId, dropSeasonId),
        eq(dropPlayers.dropTeamId, dropTeamId)
      )
    );

  if (players.length === 0) return [];

  const playerIds = players.map((p) => p.id);
  const idSet = new Set(playerIds);

  // 2. Load all weigh-ins for these players up to and including the target week.
  //    We need every week <= target so we can reconstruct history.
  //    Drizzle doesn't have inArray across a dynamically-sized list without a
  //    separate import — use a raw subquery would be complex; instead we load
  //    all weigh-ins for the season/players and filter in JS (roster sizes are
  //    small, ≤ 30 players).
  const allWeighIns = await db
    .select({
      dropPlayerId: dropWeighIns.dropPlayerId,
      weekNumber: dropWeighIns.weekNumber,
      weightG: dropWeighIns.weightG,
      deltaVsPriorWeekG: dropWeighIns.deltaVsPriorWeekG,
    })
    .from(dropWeighIns)
    .where(
      and(
        eq(dropWeighIns.dropSeasonId, dropSeasonId),
        lte(dropWeighIns.weekNumber, weekNumber)
      )
    )
    .orderBy(dropWeighIns.dropPlayerId, dropWeighIns.weekNumber);

  // Keep only weigh-ins that belong to this team's players
  const teamWeighIns = allWeighIns.filter((w) => idSet.has(w.dropPlayerId));

  // Group weigh-ins by player
  const weighInsByPlayer = new Map<string, typeof teamWeighIns>();
  for (const wi of teamWeighIns) {
    const bucket = weighInsByPlayer.get(wi.dropPlayerId) ?? [];
    bucket.push(wi);
    weighInsByPlayer.set(wi.dropPlayerId, bucket);
  }

  // 3. Load food diary submissions for (player, target week)
  const foodDiaryRows = await db
    .select({
      dropPlayerId: dropFoodDiary.dropPlayerId,
      submitted: dropFoodDiary.submitted,
      coachConfirmed: dropFoodDiary.coachConfirmed,
    })
    .from(dropFoodDiary)
    .where(eq(dropFoodDiary.weekNumber, weekNumber));

  // Index food diary by playerId (only rows with submitted + coachConfirmed)
  const foodDiarySet = new Set<string>(
    foodDiaryRows
      .filter((fd) => idSet.has(fd.dropPlayerId) && fd.submitted && fd.coachConfirmed)
      .map((fd) => fd.dropPlayerId)
  );

  // 4. Build PlayerWeek for each player that has a weigh-in this week
  const result: PlayerWeek[] = [];

  for (const player of players) {
    const wiHistory = weighInsByPlayer.get(player.id) ?? [];

    // Find this week's weigh-in
    const thisWeekWI = wiHistory.find((w) => w.weekNumber === weekNumber);
    if (!thisWeekWI) {
      // No weigh-in this week → player didn't participate
      continue;
    }

    const currentWeightG = thisWeekWI.weightG;

    // Prior week weigh-in (week N-1)
    const priorWI = wiHistory.find((w) => w.weekNumber === weekNumber - 1);
    const priorWeekWeightG = priorWI?.weightG ?? null;

    // priorWeeksLost: count weeks BEFORE the target where the player lost vs the
    // immediately prior week — computed LIVE from the weigh-in weights, NOT the
    // stored deltaVsPriorWeekG (which goes stale if an earlier week's weight is
    // later corrected). This keeps scoring derivation purely from source weights.
    const weightByWeek = new Map(wiHistory.map((w) => [w.weekNumber, w.weightG]));
    let priorWeeksLost = 0;
    for (const w of wiHistory) {
      if (w.weekNumber >= weekNumber) continue;
      const prev = weightByWeek.get(w.weekNumber - 1);
      if (prev !== undefined && w.weightG < prev) priorWeeksLost++;
    }

    // hatTricksAwarded: derived — one hat-trick per 3 consecutive lost weeks, max 4
    const hatTricksAwarded = Math.min(Math.floor(priorWeeksLost / 3), 4);

    // 5% milestone: check if any prior weigh-in hit ≥5% loss vs season start
    const seasonStartWeightG = player.seasonStartWeightG;
    const fivePctAwarded = wiHistory.some(
      (w) =>
        w.weekNumber < weekNumber &&
        (seasonStartWeightG - w.weightG) / seasonStartWeightG >= 0.05
    );

    // 10% milestone: same with ≥10%
    const tenPctAwarded = wiHistory.some(
      (w) =>
        w.weekNumber < weekNumber &&
        (seasonStartWeightG - w.weightG) / seasonStartWeightG >= 0.1
    );

    result.push({
      playerId: player.id,
      weekNumber,
      currentWeightG,
      priorWeekWeightG,
      seasonStartWeightG,
      isMaintenance: player.maintenanceStatus,
      priorWeeksLost,
      hatTricksAwarded,
      fivePctAwarded,
      tenPctAwarded,
      foodDiarySubmitted: foodDiarySet.has(player.id),
    });
  }

  return result;
}
