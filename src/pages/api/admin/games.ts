import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { games, teams, venues, seasons, programs, locations } from "@/lib/db/schema";
import { eq, asc, desc, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  notifyScheduleChange,
  notifyEventCancellation,
} from "@/lib/messaging/notifications";

const gameSchema = z.object({
  seasonId: z.string().uuid("Valid season ID is required"),
  homeTeamId: z.string().uuid().optional().nullable(),
  awayTeamId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  fieldNumber: z.string().optional().nullable(),
  scheduledAt: z.string().datetime({ message: "Valid date/time is required" }),
  durationMinutes: z.number().min(1).optional().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "postponed", "cancelled"]).default("scheduled"),
  homeScore: z.number().min(0).optional().nullable(),
  awayScore: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET - List all games (optionally filtered)
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const seasonId = url.searchParams.get("seasonId");
    const teamId = url.searchParams.get("teamId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // Join through seasons -> programs -> locations to filter by organization
    let query = getDb()
      .select({
        id: games.id,
        seasonId: games.seasonId,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        venueId: games.venueId,
        fieldNumber: games.fieldNumber,
        scheduledAt: games.scheduledAt,
        durationMinutes: games.durationMinutes,
        status: games.status,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        notes: games.notes,
        createdAt: games.createdAt,
      })
      .from(games)
      .innerJoin(seasons, eq(games.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id));

    // Always filter by organization
    const conditions = [eq(locations.organizationId, orgContext.organizationId)];

    if (seasonId) {
      conditions.push(eq(games.seasonId, seasonId));
    }

    if (teamId) {
      // Games where the team is either home or away would need OR logic
      // For now, filter in JS
    }

    if (startDate) {
      conditions.push(gte(games.scheduledAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(games.scheduledAt, new Date(endDate)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allGames = await query.orderBy(asc(games.scheduledAt));

    // Fetch related data separately
    const gameIds = allGames.map(g => g.id);

    // Get teams and venues for all games
    const teamsMap = new Map();
    const venuesMap = new Map();
    const seasonsMap = new Map();

    const uniqueTeamIds = [...new Set([
      ...allGames.map(g => g.homeTeamId).filter(Boolean),
      ...allGames.map(g => g.awayTeamId).filter(Boolean),
    ])];

    const uniqueVenueIds = [...new Set(allGames.map(g => g.venueId).filter(Boolean))];
    const uniqueSeasonIds = [...new Set(allGames.map(g => g.seasonId))];

    if (uniqueTeamIds.length > 0) {
      const teamsList = await getDb().select().from(teams);
      teamsList.forEach(t => teamsMap.set(t.id, t));
    }

    if (uniqueVenueIds.length > 0) {
      const venuesList = await getDb().select().from(venues);
      venuesList.forEach(v => venuesMap.set(v.id, v));
    }

    if (uniqueSeasonIds.length > 0) {
      const seasonsList = await getDb()
        .select({
          id: seasons.id,
          name: seasons.name,
          programId: seasons.programId,
          program: {
            id: programs.id,
            name: programs.name,
          },
        })
        .from(seasons)
        .leftJoin(programs, eq(seasons.programId, programs.id));
      seasonsList.forEach(s => seasonsMap.set(s.id, s));
    }

    // Enrich games with related data
    const enrichedGames = allGames.map(game => ({
      ...game,
      homeTeam: game.homeTeamId ? teamsMap.get(game.homeTeamId) : null,
      awayTeam: game.awayTeamId ? teamsMap.get(game.awayTeamId) : null,
      venue: game.venueId ? venuesMap.get(game.venueId) : null,
      season: seasonsMap.get(game.seasonId),
    }));

    // Filter by teamId if needed
    let filteredGames = enrichedGames;
    if (teamId) {
      filteredGames = enrichedGames.filter(
        g => g.homeTeamId === teamId || g.awayTeamId === teamId
      );
    }

    return new Response(JSON.stringify({ games: filteredGames }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch games" }), { status: 500 });
  }
};

// POST - Create new game
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = gameSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify season belongs to this organization
    const [seasonCheck] = await getDb()
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(seasons.id, result.data.seasonId),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!seasonCheck) {
      return new Response(JSON.stringify({ error: "Season not found in this organization" }), { status: 404 });
    }

    // Verify teams belong to this organization if provided
    if (result.data.homeTeamId) {
      const [teamCheck] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(
          eq(teams.id, result.data.homeTeamId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!teamCheck) {
        return new Response(JSON.stringify({ error: "Home team not found in this organization" }), { status: 404 });
      }
    }

    if (result.data.awayTeamId) {
      const [teamCheck] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(
          eq(teams.id, result.data.awayTeamId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!teamCheck) {
        return new Response(JSON.stringify({ error: "Away team not found in this organization" }), { status: 404 });
      }
    }

    // Verify venue belongs to this organization if provided
    if (result.data.venueId) {
      const [venueCheck] = await getDb()
        .select({ id: venues.id })
        .from(venues)
        .innerJoin(locations, eq(venues.locationId, locations.id))
        .where(and(
          eq(venues.id, result.data.venueId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!venueCheck) {
        return new Response(JSON.stringify({ error: "Venue not found in this organization" }), { status: 404 });
      }
    }

    const [newGame] = await getDb()
      .insert(games)
      .values({
        ...result.data,
        scheduledAt: new Date(result.data.scheduledAt),
      })
      .returning();

    return new Response(JSON.stringify({ game: newGame }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating game:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23503") {
      return new Response(JSON.stringify({ error: "Invalid team, venue, or season selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to create game" }), { status: 500 });
  }
};

// PUT - Update game
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Game ID is required" }), { status: 400 });
    }

    // Verify game belongs to this organization AND load the previous state
    // so we can detect schedule / status changes for notifications.
    const [gameCheck] = await getDb()
      .select({
        id: games.id,
        previousScheduledAt: games.scheduledAt,
        previousStatus: games.status,
      })
      .from(games)
      .innerJoin(seasons, eq(games.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(games.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!gameCheck) {
      return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
    }

    const result = gameSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify new season belongs to this organization
    const [seasonCheck] = await getDb()
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(seasons.id, result.data.seasonId),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!seasonCheck) {
      return new Response(JSON.stringify({ error: "Season not found in this organization" }), { status: 404 });
    }

    // Verify teams belong to this organization if provided
    if (result.data.homeTeamId) {
      const [teamCheck] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(
          eq(teams.id, result.data.homeTeamId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!teamCheck) {
        return new Response(JSON.stringify({ error: "Home team not found in this organization" }), { status: 404 });
      }
    }

    if (result.data.awayTeamId) {
      const [teamCheck] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(
          eq(teams.id, result.data.awayTeamId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!teamCheck) {
        return new Response(JSON.stringify({ error: "Away team not found in this organization" }), { status: 404 });
      }
    }

    // Verify venue belongs to this organization if provided
    if (result.data.venueId) {
      const [venueCheck] = await getDb()
        .select({ id: venues.id })
        .from(venues)
        .innerJoin(locations, eq(venues.locationId, locations.id))
        .where(and(
          eq(venues.id, result.data.venueId),
          eq(locations.organizationId, orgContext.organizationId)
        ));
      if (!venueCheck) {
        return new Response(JSON.stringify({ error: "Venue not found in this organization" }), { status: 404 });
      }
    }

    const newScheduledAt = new Date(result.data.scheduledAt);
    const [updatedGame] = await getDb()
      .update(games)
      .set({
        ...result.data,
        scheduledAt: newScheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(games.id, id))
      .returning();

    if (!updatedGame) {
      return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
    }

    // Fire notifications if the schedule moved or the game was cancelled /
    // postponed. These run async — admin response is not blocked on delivery.
    const scheduleChanged =
      gameCheck.previousScheduledAt.getTime() !== newScheduledAt.getTime();
    const becameCancelled =
      gameCheck.previousStatus !== "cancelled" &&
      result.data.status === "cancelled";
    const becamePostponed =
      gameCheck.previousStatus !== "postponed" &&
      result.data.status === "postponed";

    if (becameCancelled || becamePostponed) {
      notifyEventCancellation(
        id,
        becamePostponed ? "postponed" : "cancelled",
      ).catch((err) => {
        console.error("Game cancellation notification error:", err);
      });
    } else if (scheduleChanged) {
      notifyScheduleChange(id, gameCheck.previousScheduledAt).catch((err) => {
        console.error("Schedule change notification error:", err);
      });
    }

    return new Response(JSON.stringify({ game: updatedGame }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating game:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23503") {
      return new Response(JSON.stringify({ error: "Invalid team, venue, or season selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to update game" }), { status: 500 });
  }
};

// DELETE - Delete game
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Game ID is required" }), { status: 400 });
    }

    // Verify game belongs to this organization
    const [gameCheck] = await getDb()
      .select({ id: games.id })
      .from(games)
      .innerJoin(seasons, eq(games.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(games.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!gameCheck) {
      return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
    }

    // Fire the cancellation notification BEFORE the delete so the
    // notification module can still load the game context.
    notifyEventCancellation(id, "deleted").catch((err) => {
      console.error("Delete notification error:", err);
    });

    await getDb().delete(games).where(eq(games.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting game:", error);
    return new Response(JSON.stringify({ error: "Failed to delete game" }), { status: 500 });
  }
};
