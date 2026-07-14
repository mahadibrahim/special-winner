import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { games, teams, venues, seasons, programs, locations } from "@/lib/db/schema";
import { eq, asc, desc, and, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  notifyScheduleChange,
  notifyEventCancellation,
} from "@/lib/messaging/notifications";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import {
  rescheduleActivityCompletions,
  cancelActivityCompletions,
} from "@/lib/activity-tracking/lifecycle";
import { syncGameBlock } from "@/lib/scheduling/sync";
import { removeSourceBlock, BlockConflictError } from "@/lib/scheduling/blocks";

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
  const auth = await requireSuperAdminAccess(context);
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
      ...allGames.map(g => g.homeTeamId).filter((v): v is string => Boolean(v)),
      ...allGames.map(g => g.awayTeamId).filter((v): v is string => Boolean(v)),
    ])];

    const uniqueVenueIds = [...new Set(allGames.map(g => g.venueId).filter((v): v is string => Boolean(v)))];
    const uniqueSeasonIds = [...new Set(allGames.map(g => g.seasonId))];

    // The three lookups below are independent of each other — run them in
    // parallel. Each is also now filtered to the specific ids this page of
    // games actually references (uniqueTeamIds/uniqueVenueIds/uniqueSeasonIds
    // were computed above but previously went unused, so every call
    // full-org-overfetched teams/venues/seasons regardless of how many games
    // were on the page).
    const [teamsList, venuesList, seasonsList] = await Promise.all([
      uniqueTeamIds.length > 0
        // Scope teams by org via teams -> seasons -> programs -> locations
        ? getDb()
            .select({ team: teams })
            .from(teams)
            .innerJoin(seasons, eq(teams.seasonId, seasons.id))
            .innerJoin(programs, eq(seasons.programId, programs.id))
            .innerJoin(locations, eq(programs.locationId, locations.id))
            .where(
              and(
                eq(locations.organizationId, orgContext.organizationId),
                inArray(teams.id, uniqueTeamIds),
              ),
            )
        : Promise.resolve([]),

      uniqueVenueIds.length > 0
        // Scope venues by org via venues -> locations
        ? getDb()
            .select({ venue: venues })
            .from(venues)
            .innerJoin(locations, eq(venues.locationId, locations.id))
            .where(
              and(
                eq(locations.organizationId, orgContext.organizationId),
                inArray(venues.id, uniqueVenueIds),
              ),
            )
        : Promise.resolve([]),

      uniqueSeasonIds.length > 0
        ? getDb()
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
            .innerJoin(programs, eq(seasons.programId, programs.id))
            .innerJoin(locations, eq(programs.locationId, locations.id))
            .where(
              and(
                eq(locations.organizationId, orgContext.organizationId),
                inArray(seasons.id, uniqueSeasonIds),
              ),
            )
        : Promise.resolve([]),
    ]);

    teamsList.forEach(row => teamsMap.set(row.team.id, row.team));
    venuesList.forEach(row => venuesMap.set(row.venue.id, row.venue));
    seasonsList.forEach(s => seasonsMap.set(s.id, s));

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
  const auth = await requireSuperAdminAccess(context);
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

    // Seed activity_completions for the new game. Failure here is logged
    // but does not fail the request — admins can re-bootstrap from the
    // game detail UI if catalog/DB issues prevent a row from being
    // created on first save.
    bootstrapActivityCompletions(newGame.id).catch((err) => {
      console.error("[bootstrap] failed for game", newGame.id, err);
    });

    // Field-time ledger: claim the slot. A conflict (another game, a
    // rental, an external Good Rec hold) comes back as a 409 with the
    // blocking label; the game row stays so the admin can move it.
    try {
      await syncGameBlock(newGame.id);
    } catch (err) {
      if (err instanceof BlockConflictError) {
        return new Response(
          JSON.stringify({ game: newGame, warning: err.message }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

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
  const auth = await requireSuperAdminAccess(context);
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

    // Field-time ledger: re-sync (handles move, venue/field change, and
    // cancel/postpone which release the slot). Conflict → 409 + label.
    try {
      await syncGameBlock(updatedGame.id);
    } catch (err) {
      if (err instanceof BlockConflictError) {
        return new Response(
          JSON.stringify({ game: updatedGame, warning: err.message }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      throw err;
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
      // Also flip every still-actionable activity_completions row to
      // canceled. Completed rows are preserved (historical work stands).
      cancelActivityCompletions(id).catch((err) => {
        console.error("[cancel activity completions]", err);
      });
    } else if (scheduleChanged) {
      notifyScheduleChange(id, gameCheck.previousScheduledAt).catch((err) => {
        console.error("Schedule change notification error:", err);
      });
      // Recompute expected_at against the new kickoff for every
      // still-actionable row and clear stale reminders.
      rescheduleActivityCompletions(id).catch((err) => {
        console.error("[reschedule activity completions]", err);
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
  const auth = await requireSuperAdminAccess(context);
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
    await removeSourceBlock("game", id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting game:", error);
    return new Response(JSON.stringify({ error: "Failed to delete game" }), { status: 500 });
  }
};
