/**
 * GET /api/drop/me
 *
 * Returns the authenticated player's own Drop League data — their most recent
 * season, all weigh-ins, computed stats, and team standing.
 *
 * Privacy: weight data is only returned for the requesting user's own player
 * row. The endpoint finds the player by `userId = locals.user.id`, so it is
 * structurally impossible to leak another user's data.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropPlayers,
  dropWeighIns,
  dropSeasons,
  dropTeams,
  dropMatches,
} from "@/lib/db/schema/drop-league";
import {
  computeStandings,
  type MatchRow,
} from "@/lib/drop-league/standings";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const db = getDb();

  // Find the user's most recent player row (userId is indexed). Explicit
  // projection — never pull email/phone/dob/bmi/height into memory here.
  const [player] = await db
    .select({
      id: dropPlayers.id,
      organizationId: dropPlayers.organizationId,
      dropSeasonId: dropPlayers.dropSeasonId,
      dropTeamId: dropPlayers.dropTeamId,
      division: dropPlayers.division,
      seasonStartWeightG: dropPlayers.seasonStartWeightG,
      currentWeightG: dropPlayers.currentWeightG,
      fivePctAwarded: dropPlayers.fivePctAwarded,
      tenPctAwarded: dropPlayers.tenPctAwarded,
      hatTricksAwarded: dropPlayers.hatTricksAwarded,
    })
    .from(dropPlayers)
    .where(eq(dropPlayers.userId, locals.user.id))
    .orderBy(desc(dropPlayers.createdAt))
    .limit(1);

  if (!player) {
    return json({ player: null }, 200);
  }

  // Load season metadata, weigh-ins, and (if teamed) team + matches in parallel.
  const [season, weighIns, team, matches] = await Promise.all([
    db
      .select({ name: dropSeasons.name, division: dropSeasons.division })
      .from(dropSeasons)
      .where(eq(dropSeasons.id, player.dropSeasonId))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    db
      .select({
        weekNumber: dropWeighIns.weekNumber,
        weightG: dropWeighIns.weightG,
        deltaVsPriorWeekG: dropWeighIns.deltaVsPriorWeekG,
      })
      .from(dropWeighIns)
      .where(eq(dropWeighIns.dropPlayerId, player.id))
      .orderBy(asc(dropWeighIns.weekNumber)),

    player.dropTeamId
      ? db
          .select({ id: dropTeams.id, name: dropTeams.name })
          .from(dropTeams)
          .where(eq(dropTeams.id, player.dropTeamId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),

    player.dropTeamId
      ? db
          .select({
            homeTeamId: dropMatches.homeTeamId,
            awayTeamId: dropMatches.awayTeamId,
            homeFinalScore: dropMatches.homeFinalScore,
            awayFinalScore: dropMatches.awayFinalScore,
            homeBonusGoals: dropMatches.homeBonusGoals,
            awayBonusGoals: dropMatches.awayBonusGoals,
          })
          .from(dropMatches)
          .where(
            and(
              eq(dropMatches.dropSeasonId, player.dropSeasonId),
              eq(dropMatches.organizationId, player.organizationId),
              eq(dropMatches.status, "final"),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Compute team standing from season matches.
  let standing = null;
  if (team && matches.length > 0) {
    // computeStandings needs numeric scores; the schema stores as numeric()
    // which Drizzle returns as strings. Cast here at the boundary.
    const matchRows: MatchRow[] = matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeFinalScore: Number(m.homeFinalScore),
      awayFinalScore: Number(m.awayFinalScore),
      homeBonusGoals: Number(m.homeBonusGoals),
      awayBonusGoals: Number(m.awayBonusGoals),
    }));

    // Collect all team ids from the matches so the standings table is complete.
    const teamIds = Array.from(
      new Set(matchRows.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
    );
    if (!teamIds.includes(team.id)) teamIds.push(team.id);

    const rows = computeStandings(teamIds, matchRows);
    const myRow = rows.find((r) => r.teamId === team.id) ?? null;
    if (myRow) {
      standing = {
        played: myRow.played,
        won: myRow.won,
        drawn: myRow.drawn,
        lost: myRow.lost,
        points: myRow.points,
        bonusGoals: myRow.bonusGoals,
        totalGoals: myRow.totalGoals,
      };
    }
  }

  // Stats — compute from the player row (source of truth for milestones).
  const totalLostG = player.seasonStartWeightG - player.currentWeightG;
  const pctLost =
    player.seasonStartWeightG > 0
      ? Math.round((totalLostG / player.seasonStartWeightG) * 1000) / 10
      : 0;

  return json(
    {
      player: {
        division: player.division,
        seasonName: season?.name ?? null,
      },
      weighIns: weighIns.map((w) => ({
        weekNumber: w.weekNumber,
        weightG: w.weightG,
        deltaVsPriorWeekG: w.deltaVsPriorWeekG,
      })),
      stats: {
        totalLostG,
        pctLost,
        fivePctAwarded: player.fivePctAwarded,
        tenPctAwarded: player.tenPctAwarded,
        hatTricksAwarded: player.hatTricksAwarded,
      },
      team: team ? { name: team.name } : null,
      standing,
    },
    200
  );
};
