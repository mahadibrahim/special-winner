import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { rosters, teams, registrations, familyMembers, seasons, programs, locations } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const rosterSchema = z.object({
  teamId: z.string().uuid("Valid team ID is required"),
  registrationId: z.string().uuid("Valid registration ID is required"),
  jerseyNumber: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "injured"]).default("active"),
  notes: z.string().optional().nullable(),
});

// GET - Get available players for a team (unassigned registrations for the season)
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Get the team's season - verify it belongs to this organization
    const [teamResult] = await db
      .select({ team: teams })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(teams.id, teamId),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    const team = teamResult?.team;

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    // Get all confirmed registrations for this season
    const seasonRegistrations = await db
      .select({
        id: registrations.id,
        status: registrations.status,
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          dateOfBirth: familyMembers.dateOfBirth,
        },
      })
      .from(registrations)
      .leftJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(
        and(
          eq(registrations.seasonId, team.seasonId),
          eq(registrations.status, "confirmed")
        )
      );

    // Get registrations already assigned to any team in this season
    const assignedRegistrationIds = await db
      .select({ registrationId: rosters.registrationId })
      .from(rosters)
      .leftJoin(teams, eq(rosters.teamId, teams.id))
      .where(eq(teams.seasonId, team.seasonId));

    const assignedIds = new Set(assignedRegistrationIds.map((r) => r.registrationId));

    // Filter to only unassigned registrations
    const availablePlayers = seasonRegistrations.filter(
      (reg) => !assignedIds.has(reg.id)
    );

    return new Response(JSON.stringify({ availablePlayers }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching available players:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch available players" }), { status: 500 });
  }
};

// POST - Add player to roster
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = rosterSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify team belongs to this organization
    const [teamResult] = await db
      .select({ team: teams })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(teams.id, result.data.teamId),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    const team = teamResult?.team;

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
    }

    // Check if player is already on this team
    const existingRoster = await db.query.rosters.findFirst({
      where: and(
        eq(rosters.teamId, result.data.teamId),
        eq(rosters.registrationId, result.data.registrationId)
      ),
    });

    if (existingRoster) {
      return new Response(
        JSON.stringify({ error: "Player is already on this team" }),
        { status: 409 }
      );
    }

    // Check team roster size limit
    if (team.maxRosterSize) {
      const currentRosterCount = await db
        .select({ id: rosters.id })
        .from(rosters)
        .where(eq(rosters.teamId, result.data.teamId));

      if (currentRosterCount.length >= team.maxRosterSize) {
        return new Response(
          JSON.stringify({ error: "Team roster is full" }),
          { status: 400 }
        );
      }
    }

    const [newRoster] = await db
      .insert(rosters)
      .values({
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ roster: newRoster }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error adding player to roster:", error);
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid team or registration" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to add player to roster" }), { status: 500 });
  }
};

// PUT - Update roster entry
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, jerseyNumber, position, status, notes } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Roster entry ID is required" }), { status: 400 });
    }

    // Verify roster entry belongs to a team in this organization
    const [rosterCheck] = await db
      .select({ roster: rosters })
      .from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(rosters.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!rosterCheck) {
      return new Response(JSON.stringify({ error: "Roster entry not found" }), { status: 404 });
    }

    const [updatedRoster] = await db
      .update(rosters)
      .set({
        jerseyNumber,
        position,
        status,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(rosters.id, id))
      .returning();

    return new Response(JSON.stringify({ roster: updatedRoster }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating roster entry:", error);
    return new Response(JSON.stringify({ error: "Failed to update roster entry" }), { status: 500 });
  }
};

// DELETE - Remove player from roster
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Roster entry ID is required" }), { status: 400 });
    }

    // Verify roster entry belongs to a team in this organization
    const [rosterCheck] = await db
      .select({ roster: rosters })
      .from(rosters)
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(
        eq(rosters.id, id),
        eq(locations.organizationId, orgContext.organizationId)
      ));

    if (!rosterCheck) {
      return new Response(JSON.stringify({ error: "Roster entry not found" }), { status: 404 });
    }

    await db.delete(rosters).where(eq(rosters.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error removing player from roster:", error);
    return new Response(JSON.stringify({ error: "Failed to remove player from roster" }), { status: 500 });
  }
};
