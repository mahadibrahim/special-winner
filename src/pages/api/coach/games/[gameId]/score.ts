import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { games, teams, standings } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { z } from "zod";

const updateScoreSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  status: z.enum(["in_progress", "completed"]).optional(),
  notes: z.string().optional(),
});

// PUT - Update game score
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { gameId } = params;
    if (!gameId) {
      return new Response(JSON.stringify({ error: "Game ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the game
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId));

    if (!game) {
      return new Response(JSON.stringify({ error: "Game not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify user is coach of home or away team
    const isCoachOfHomeTeam = game.homeTeamId
      ? await db
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.id, game.homeTeamId),
              or(
                eq(teams.coachUserId, user.id),
                eq(teams.assistantCoachUserId, user.id)
              )
            )
          )
          .then((r) => r.length > 0)
      : false;

    const isCoachOfAwayTeam = game.awayTeamId
      ? await db
          .select({ id: teams.id })
          .from(teams)
          .where(
            and(
              eq(teams.id, game.awayTeamId),
              or(
                eq(teams.coachUserId, user.id),
                eq(teams.assistantCoachUserId, user.id)
              )
            )
          )
          .then((r) => r.length > 0)
      : false;

    if (!isCoachOfHomeTeam && !isCoachOfAwayTeam) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = updateScoreSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { homeScore, awayScore, status, notes } = validation.data;

    // Update the game
    const [updatedGame] = await db
      .update(games)
      .set({
        homeScore,
        awayScore,
        status: status || game.status,
        notes: notes !== undefined ? notes : game.notes,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId))
      .returning();

    // If game is completed, update standings
    if (status === "completed" && game.status !== "completed") {
      await updateStandings(game.seasonId, game.homeTeamId, game.awayTeamId, homeScore, awayScore);
    }

    return new Response(JSON.stringify({ game: updatedGame }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating game score:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

async function updateStandings(
  seasonId: string,
  homeTeamId: string | null,
  awayTeamId: string | null,
  homeScore: number,
  awayScore: number
) {
  if (!homeTeamId || !awayTeamId) return;

  // Determine winner
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const tie = homeScore === awayScore;

  // Update home team standings
  const [homeStanding] = await db
    .select()
    .from(standings)
    .where(and(eq(standings.seasonId, seasonId), eq(standings.teamId, homeTeamId)));

  if (homeStanding) {
    await db
      .update(standings)
      .set({
        wins: homeStanding.wins + (homeWon ? 1 : 0),
        losses: homeStanding.losses + (awayWon ? 1 : 0),
        ties: homeStanding.ties + (tie ? 1 : 0),
        pointsFor: homeStanding.pointsFor + homeScore,
        pointsAgainst: homeStanding.pointsAgainst + awayScore,
        gamesPlayed: homeStanding.gamesPlayed + 1,
        updatedAt: new Date(),
      })
      .where(eq(standings.id, homeStanding.id));
  } else {
    await db.insert(standings).values({
      seasonId,
      teamId: homeTeamId,
      wins: homeWon ? 1 : 0,
      losses: awayWon ? 1 : 0,
      ties: tie ? 1 : 0,
      pointsFor: homeScore,
      pointsAgainst: awayScore,
      gamesPlayed: 1,
    });
  }

  // Update away team standings
  const [awayStanding] = await db
    .select()
    .from(standings)
    .where(and(eq(standings.seasonId, seasonId), eq(standings.teamId, awayTeamId)));

  if (awayStanding) {
    await db
      .update(standings)
      .set({
        wins: awayStanding.wins + (awayWon ? 1 : 0),
        losses: awayStanding.losses + (homeWon ? 1 : 0),
        ties: awayStanding.ties + (tie ? 1 : 0),
        pointsFor: awayStanding.pointsFor + awayScore,
        pointsAgainst: awayStanding.pointsAgainst + homeScore,
        gamesPlayed: awayStanding.gamesPlayed + 1,
        updatedAt: new Date(),
      })
      .where(eq(standings.id, awayStanding.id));
  } else {
    await db.insert(standings).values({
      seasonId,
      teamId: awayTeamId,
      wins: awayWon ? 1 : 0,
      losses: homeWon ? 1 : 0,
      ties: tie ? 1 : 0,
      pointsFor: awayScore,
      pointsAgainst: homeScore,
      gamesPlayed: 1,
    });
  }
}
