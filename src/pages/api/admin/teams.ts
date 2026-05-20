import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, seasons, programs, users, rosters, registrations, familyMembers, locations } from "@/lib/db/schema";
import { eq, asc, desc, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const teamSchema = z.object({
  seasonId: z.string().uuid("Valid season ID is required"),
  name: z.string().min(1, "Name is required"),
  color: z.string().optional().nullable(),
  coachUserId: z.string().uuid().optional().nullable(),
  assistantCoachUserId: z.string().uuid().optional().nullable(),
  maxRosterSize: z.number().min(1).optional().nullable(),
  division: z.string().optional().nullable(),
});

// GET - List all teams (optionally filtered by season)
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const seasonId = url.searchParams.get("seasonId");
    const teamId = url.searchParams.get("id");

    // If fetching a single team with roster
    if (teamId) {
      const team = await getDb().query.teams.findFirst({
        where: eq(teams.id, teamId),
        orderBy: (t, { asc }) => asc(t.createdAt),
        with: {
          season: {
            with: {
              program: {
                with: {
                  location: true,
                },
              },
            },
          },
          coach: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assistantCoach: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          rosters: {
            with: {
              registration: {
                with: {
                  familyMember: true,
                },
              },
            },
          },
        },
      });

      // Verify team belongs to this organization
      if (!team || team.season?.program?.location?.organizationId !== orgContext.organizationId) {
        return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
      }

      return new Response(JSON.stringify({ team }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // List teams - filter by organization through the chain
    let query = getDb()
      .select({
        id: teams.id,
        seasonId: teams.seasonId,
        name: teams.name,
        color: teams.color,
        coachUserId: teams.coachUserId,
        assistantCoachUserId: teams.assistantCoachUserId,
        maxRosterSize: teams.maxRosterSize,
        division: teams.division,
        createdAt: teams.createdAt,
        season: {
          id: seasons.id,
          name: seasons.name,
        },
        program: {
          id: programs.id,
          name: programs.name,
        },
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        seasonId
          ? and(eq(locations.organizationId, orgContext.organizationId), eq(teams.seasonId, seasonId))
          : eq(locations.organizationId, orgContext.organizationId)
      );

    const allTeams = await query.orderBy(asc(teams.name));

    // Roster counts in one grouped query instead of one query per team.
    const teamIds = allTeams.map((t) => t.id);
    const counts =
      teamIds.length > 0
        ? await getDb()
            .select({
              teamId: rosters.teamId,
              count: sql<number>`count(*)::int`,
            })
            .from(rosters)
            .where(inArray(rosters.teamId, teamIds))
            .groupBy(rosters.teamId)
        : [];
    const countByTeam = new Map(
      counts.map((c) => [c.teamId, Number(c.count)]),
    );

    const teamsWithCounts = allTeams.map((team) => ({
      ...team,
      rosterCount: countByTeam.get(team.id) ?? 0,
    }));

    return new Response(JSON.stringify({ teams: teamsWithCounts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching teams:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch teams" }), { status: 500 });
  }
};

// POST - Create new team
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = teamSchema.safeParse(body);

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

    const [newTeam] = await getDb()
      .insert(teams)
      .values({
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ team: newTeam }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating team:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid season or coach selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to create team" }), { status: 500 });
  }
};

// PUT - Update team
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Verify team belongs to this organization
    const [teamCheck] = await getDb()
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(teams.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!teamCheck) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    const result = teamSchema.safeParse(data);
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

    const [updatedTeam] = await getDb()
      .update(teams)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, id))
      .returning();

    if (!updatedTeam) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ team: updatedTeam }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating team:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid season or coach selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to update team" }), { status: 500 });
  }
};

// DELETE - Delete team
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Verify team belongs to this organization
    const [teamCheck] = await getDb()
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(teams.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!teamCheck) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    const [deletedTeam] = await getDb().delete(teams).where(eq(teams.id, id)).returning();

    if (!deletedTeam) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting team:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete team that has games or roster entries" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete team" }), { status: 500 });
  }
};
