import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, games, venues } from "@/lib/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { isCoachOfTeam } from "@/lib/auth/roles";

// GET - Get all games for a specific team
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { teamId } = params;
    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify user is coach of this team
    const isCoach = await isCoachOfTeam(user.id, teamId);
    if (!isCoach) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all games where team is home or away
    const teamGames = await getDb()
      .select({
        id: games.id,
        seasonId: games.seasonId,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        scheduledAt: games.scheduledAt,
        durationMinutes: games.durationMinutes,
        status: games.status,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        fieldNumber: games.fieldNumber,
        notes: games.notes,
        venue: {
          id: venues.id,
          name: venues.name,
          address: venues.address,
        },
      })
      .from(games)
      .leftJoin(venues, eq(games.venueId, venues.id))
      .where(
        or(
          eq(games.homeTeamId, teamId),
          eq(games.awayTeamId, teamId)
        )
      )
      .orderBy(desc(games.scheduledAt));

    // Get opponent names for each game
    const gamesWithOpponents = await Promise.all(
      teamGames.map(async (game) => {
        const isHome = game.homeTeamId === teamId;
        const opponentId = isHome ? game.awayTeamId : game.homeTeamId;

        let opponent = null;
        if (opponentId) {
          const [opponentTeam] = await getDb()
            .select({ id: teams.id, name: teams.name, color: teams.color })
            .from(teams)
            .where(eq(teams.id, opponentId));
          opponent = opponentTeam || null;
        }

        return {
          ...game,
          isHome,
          opponent,
        };
      })
    );

    return new Response(JSON.stringify({ games: gamesWithOpponents }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
