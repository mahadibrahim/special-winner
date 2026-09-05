import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { rosters, teams, teamGroups, games, registrations, familyMembers, seasons, programs, locations } from "@/lib/db/schema";
import { eq, and, isNull, or, asc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { scheduleGroupCreation } from "@/lib/messaging/group-lifecycle";
import { syncTeamGroupMembership } from "@/lib/messaging/team-group-sync";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

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
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const teamId = url.searchParams.get("teamId");
    const freeAgentsOnly = url.searchParams.get("freeAgents") === "true";

    if (!teamId) {
      return new Response(JSON.stringify({ error: "Team ID is required" }), { status: 400 });
    }

    // Get the team's season - verify it belongs to this organization
    const [teamResult] = await getDb()
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

    // Get all confirmed registrations for this season (optionally filtered to free agents)
    const registrationWhere = freeAgentsOnly
      ? and(
          eq(registrations.seasonId, team.seasonId),
          eq(registrations.status, "confirmed"),
          eq(registrations.lookingForTeam, true),
        )
      : and(
          eq(registrations.seasonId, team.seasonId),
          eq(registrations.status, "confirmed"),
        );

    const seasonRegistrations = await getDb()
      .select({
        id: registrations.id,
        status: registrations.status,
        lookingForTeam: registrations.lookingForTeam,
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          birthDate: familyMembers.birthDate,
        },
      })
      .from(registrations)
      .leftJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(registrationWhere);

    // Get registrations already assigned to any team in this season
    const assignedRegistrationIds = await getDb()
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
//
// The dupe check + cap check + insert below run inside one transaction that
// takes a `FOR UPDATE` lock on the team's season row first. That is the SAME
// lock taken by `seasons/[id]/placements.ts` (batch placement publish) and
// `seasons/[id]/teams/scaffold.ts` (bulk team creation) — all three
// season-scoped roster/team writers serialize against each other through
// this one row lock, so a single add here can never race a batch publish
// (or another single add) into overshooting a team's `maxRosterSize`.
export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
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
    const [teamResult] = await getDb()
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

    // Verify the registration belongs to the same season as the team (which is
    // itself org-scoped above). Without this a super_admin could roster another
    // org's / another season's registration onto this team just by posting its
    // id. Same-season implies same-org, so this is the tightest correct check.
    const [reg] = await getDb()
      .select({ seasonId: registrations.seasonId })
      .from(registrations)
      .where(eq(registrations.id, result.data.registrationId))
      .limit(1);

    if (!reg || reg.seasonId !== team.seasonId) {
      // 404 (not 400) — conflate "not yours" with "not found" to avoid leaking
      // the existence of cross-tenant registrations.
      return new Response(JSON.stringify({ error: "Registration not found" }), { status: 404 });
    }

    // Dupe check + cap check + insert, inside one transaction that locks
    // the season row first — see the POST docstring above for why.
    const txResult = await getDb().transaction(async (tx) => {
      await tx.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, team.seasonId)).for("update");

      // Check if player is already on this team
      const [existingRoster] = await tx
        .select({ id: rosters.id })
        .from(rosters)
        .where(
          and(eq(rosters.teamId, result.data.teamId), eq(rosters.registrationId, result.data.registrationId)),
        )
        .limit(1); // (teamId, registrationId) is unique — at most one row

      if (existingRoster) {
        return { outcome: "duplicate" as const };
      }

      // Check team roster size limit
      if (team.maxRosterSize) {
        const currentRosterCount = await tx
          .select({ id: rosters.id })
          .from(rosters)
          .where(eq(rosters.teamId, result.data.teamId));

        if (currentRosterCount.length >= team.maxRosterSize) {
          return { outcome: "full" as const };
        }
      }

      const [newRoster] = await tx
        .insert(rosters)
        .values({
          ...result.data,
        })
        .returning();

      return { outcome: "created" as const, roster: newRoster };
    });

    if (txResult.outcome === "duplicate") {
      return new Response(
        JSON.stringify({ error: "Player is already on this team" }),
        { status: 409 }
      );
    }

    if (txResult.outcome === "full") {
      return new Response(
        JSON.stringify({ error: "Team roster is full" }),
        { status: 400 }
      );
    }

    // Trigger team group sync — fire and forget; don't block on Telegram
    // failures. Deliberately outside the transaction (and unawaited): a
    // Telegram/HTTP failure here must never roll back a roster write that
    // already committed.
    const rosteredTeamId = result.data.teamId;
    triggerTeamGroupSync(rosteredTeamId).catch((err) => {
      console.warn(`Team group sync failed for team ${rosteredTeamId}:`, err);
    });

    return new Response(JSON.stringify({ roster: txResult.roster }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error adding player to roster:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(JSON.stringify({ error: "Invalid team or registration" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to add player to roster" }), { status: 500 });
  }
};

// PUT - Update roster entry
export const PUT: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
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
    const [rosterCheck] = await getDb()
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

    const [updatedRoster] = await getDb()
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
  const auth = await requireSuperAdminAccess(context);
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
    const [rosterCheck] = await getDb()
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

    await getDb().delete(rosters).where(eq(rosters.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error removing player from roster:", error);
    return new Response(JSON.stringify({ error: "Failed to remove player from roster" }), { status: 500 });
  }
};

/**
 * After a roster write succeeds, ensure a team_group row exists (scheduled or
 * active) and sync membership for any active group. Runs async — roster writes
 * are never blocked on Telegram failures.
 *
 * Exported so other roster-writing endpoints (e.g. the batch placement
 * publish at admin/seasons/[id]/placements.ts) can reuse the exact same
 * fire-and-forget sync rather than re-implementing it.
 */
export async function triggerTeamGroupSync(teamId: string): Promise<void> {
  const db = getDb();

  // Find the earliest upcoming scheduled game for this team so we can seed
  // creationScheduledFor = 7 days before first event.
  const firstGameRows = await db
    .select({ scheduledAt: games.scheduledAt })
    .from(games)
    .where(
      and(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
        eq(games.status, "scheduled"),
      ),
    )
    .orderBy(asc(games.scheduledAt))
    .limit(1);

  const firstEventAt: Date | null = firstGameRows[0]?.scheduledAt ?? null;

  await scheduleGroupCreation({ teamId, firstEventAt });

  const activeGroup = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), eq(teamGroups.status, "active")),
  });

  if (activeGroup) {
    await syncTeamGroupMembership(activeGroup.id);
  }
}
