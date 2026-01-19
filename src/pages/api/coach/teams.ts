import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, sports, locations, rosters, games } from "@/lib/db/schema";
import { eq, or, and, gte, count } from "drizzle-orm";

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
        .where(eq(rosters.status, "active"))
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
      for (const teamId of teamIds) {
        const [nextGame] = await getDb()
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
                eq(games.homeTeamId, teamId),
                eq(games.awayTeamId, teamId)
              ),
              gte(games.scheduledAt, now),
              eq(games.status, "scheduled")
            )
          )
          .orderBy(games.scheduledAt)
          .limit(1);

        if (nextGame) {
          // Get opponent team name
          const isHome = nextGame.homeTeamId === teamId;
          const opponentId = isHome ? nextGame.awayTeamId : nextGame.homeTeamId;

          let opponentName: string | null = null;
          if (opponentId) {
            const [opponent] = await getDb()
              .select({ name: teams.name })
              .from(teams)
              .where(eq(teams.id, opponentId));
            opponentName = opponent?.name || null;
          }

          nextGames[teamId] = {
            id: nextGame.id,
            scheduledAt: nextGame.scheduledAt,
            opponent: opponentName,
            venue: null, // Could fetch from venues table if needed
          };
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
