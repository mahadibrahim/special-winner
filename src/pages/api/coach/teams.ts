import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, sports, locations, rosters, games } from "@/lib/db/schema";
import { eq, or, and, gte, count, inArray, asc } from "drizzle-orm";

// GET - List all teams where the user is coach or assistant coach
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Get all teams where user is coach or assistant coach
    const coachTeams = await getDb()
      .select({
        id: teams.id,
        name: teams.name,
        color: teams.color,
        logoUrl: teams.logoUrl,
        division: teams.division,
        maxRosterSize: teams.maxRosterSize,
        coachUserId: teams.coachUserId,
        assistantCoachUserId: teams.assistantCoachUserId,
        createdAt: teams.createdAt,
        season: {
          id: seasons.id,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          status: seasons.status,
        },
        program: {
          id: programs.id,
          name: programs.name,
        },
        sport: {
          id: sports.id,
          name: sports.name,
          icon: sports.icon,
          color: sports.color,
        },
        location: {
          id: locations.id,
          name: locations.name,
        },
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        or(
          eq(teams.coachUserId, user.id),
          eq(teams.assistantCoachUserId, user.id)
        )
      )
      .orderBy(seasons.startDate);

    // Get roster counts for each team
    const teamIds = coachTeams.map((t) => t.id);

    let rosterCounts: Record<string, number> = {};
    if (teamIds.length > 0) {
      const rosterCountResults = await getDb()
        .select({
          teamId: rosters.teamId,
          count: count(),
        })
        .from(rosters)
        .where(and(eq(rosters.status, "active"), inArray(rosters.teamId, teamIds)))
        .groupBy(rosters.teamId);

      rosterCounts = rosterCountResults.reduce(
        (acc, r) => {
          acc[r.teamId] = Number(r.count);
          return acc;
        },
        {} as Record<string, number>
      );
    }

    // Get next game for each team
    const now = new Date();
    let nextGames: Record<string, { id: string; scheduledAt: Date; opponent: string | null; venue: string | null }> = {};

    if (teamIds.length > 0) {
      // One query for every upcoming game involving any of the coach's
      // teams (ordered soonest-first), then pick each team's first match
      // in memory — replaces a per-team query loop.
      const upcomingGames = await getDb()
        .select({
          id: games.id,
          scheduledAt: games.scheduledAt,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
        })
        .from(games)
        .where(
          and(
            or(
              inArray(games.homeTeamId, teamIds),
              inArray(games.awayTeamId, teamIds)
            ),
            gte(games.scheduledAt, now),
            eq(games.status, "scheduled")
          )
        )
        .orderBy(asc(games.scheduledAt));

      const myTeamIds = new Set(teamIds);
      const pendingOpponent: Record<string, string | null> = {};
      for (const game of upcomingGames) {
        for (const side of [game.homeTeamId, game.awayTeamId]) {
          if (!side || !myTeamIds.has(side) || nextGames[side]) continue;
          const opponentId = side === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
          pendingOpponent[side] = opponentId;
          nextGames[side] = {
            id: game.id,
            scheduledAt: game.scheduledAt,
            opponent: null, // filled in below
            venue: null, // Could fetch from venues table if needed
          };
        }
      }

      // Batch-fetch opponent names for all next games at once.
      const opponentIds = [...new Set(Object.values(pendingOpponent).filter((id): id is string => !!id))];
      if (opponentIds.length > 0) {
        const opponents = await getDb()
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, opponentIds));
        const nameById = new Map(opponents.map((t) => [t.id, t.name]));
        for (const [teamId, opponentId] of Object.entries(pendingOpponent)) {
          if (opponentId) {
            nextGames[teamId].opponent = nameById.get(opponentId) ?? null;
          }
        }
      }
    }

    // Format response with additional data
    const teamsWithDetails = coachTeams.map((team) => ({
      ...team,
      isHeadCoach: team.coachUserId === user.id,
      rosterCount: rosterCounts[team.id] || 0,
      nextGame: nextGames[team.id] || null,
    }));

    return new Response(JSON.stringify({ teams: teamsWithDetails }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching coach teams:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
