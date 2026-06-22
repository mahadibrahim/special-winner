/**
 * GET  /api/admin/venues/:id/role-assignments — list active assignments
 * POST /api/admin/venues/:id/role-assignments — create a new assignment
 *
 * Tenant scoping:
 *   - Venue ownership: requireSameOrgVenue(orgId, venueId)
 *   - Posted userId: must have a role scoped to caller's org (verified
 *     by joining user_roles with the org's scope ids)
 *   - venue_role_assignments.organization_id is set from caller's org
 *
 * Active assignment = effective_to IS NULL.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users, userRoles } from "@/lib/db/schema/users";
import { locations, programs, seasons, teams } from "@/lib/db/schema";
import { and, eq, inArray, isNull, asc, or } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const createSchema = z.object({
  roleId: z.string().regex(/^role\.[a-z][a-z0-9_]*$/, "must match ^role\\.[a-z][a-z0-9_]*$"),
  userId: z.string().uuid("Valid user ID is required"),
  notes: z.string().optional().nullable(),
});

/**
 * Returns the set of user IDs that have any role scoped within the given org
 * (organization-scoped, or scoped to one of the org's locations/programs/teams).
 * Used to validate that a posted userId belongs to the caller's tenant.
 */
async function loadOrgUserIds(orgId: string): Promise<Set<string>> {
  const db = getDb();
  const orgLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));
  const locationIds = orgLocations.map((l) => l.id);

  const orgPrograms = locationIds.length
    ? await db
        .select({ id: programs.id })
        .from(programs)
        .where(inArray(programs.locationId, locationIds))
    : [];
  const programIds = orgPrograms.map((p) => p.id);

  const orgSeasons = programIds.length
    ? await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(inArray(seasons.programId, programIds))
    : [];
  const seasonIds = orgSeasons.map((s) => s.id);

  const orgTeams = seasonIds.length
    ? await db
        .select({ id: teams.id })
        .from(teams)
        .where(inArray(teams.seasonId, seasonIds))
    : [];
  const teamIds = orgTeams.map((t) => t.id);

  const conditions = [
    and(eq(userRoles.scopeType, "organization"), eq(userRoles.scopeId, orgId)),
  ];
  if (locationIds.length) {
    conditions.push(
      and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIds))!,
    );
  }
  if (programIds.length) {
    conditions.push(
      and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIds))!,
    );
  }
  if (teamIds.length) {
    conditions.push(
      and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIds))!,
    );
  }

  // Drizzle "or" of multiple AND clauses.
  const whereClause =
    conditions.length === 1 ? conditions[0] : or(...conditions);
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(whereClause);

  return new Set(rows.map((r) => r.userId));
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const venueId = context.params.id;
  if (!venueId) return json({ error: "venue id required" }, 400);

  const venueCheck = await requireSameOrgVenue(auth.organizationId, venueId);
  if (!venueCheck.ok) return ownershipDeniedResponse();

  const rows = await getDb()
    .select({
      id: venueRoleAssignments.id,
      organizationId: venueRoleAssignments.organizationId,
      venueId: venueRoleAssignments.venueId,
      roleId: venueRoleAssignments.roleId,
      userId: venueRoleAssignments.userId,
      effectiveFrom: venueRoleAssignments.effectiveFrom,
      effectiveTo: venueRoleAssignments.effectiveTo,
      notes: venueRoleAssignments.notes,
      createdAt: venueRoleAssignments.createdAt,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(venueRoleAssignments)
    .innerJoin(users, eq(venueRoleAssignments.userId, users.id))
    .where(
      and(
        eq(venueRoleAssignments.venueId, venueId),
        eq(venueRoleAssignments.organizationId, auth.organizationId),
        isNull(venueRoleAssignments.effectiveTo),
      ),
    )
    .orderBy(asc(venueRoleAssignments.roleId), asc(users.lastName), asc(users.firstName));

  return json({ assignments: rows }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const venueId = context.params.id;
  if (!venueId) return json({ error: "venue id required" }, 400);

  const venueCheck = await requireSameOrgVenue(auth.organizationId, venueId);
  if (!venueCheck.ok) return ownershipDeniedResponse();

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  // Verify the posted user belongs to caller's org.
  const orgUserIds = await loadOrgUserIds(auth.organizationId);
  if (!orgUserIds.has(parsed.data.userId)) {
    return json({ error: "User not in this organization" }, 404);
  }

  // If an active assignment already exists for (venue, role, user), 409.
  const [existing] = await getDb()
    .select({ id: venueRoleAssignments.id })
    .from(venueRoleAssignments)
    .where(
      and(
        eq(venueRoleAssignments.venueId, venueId),
        eq(venueRoleAssignments.roleId, parsed.data.roleId),
        eq(venueRoleAssignments.userId, parsed.data.userId),
        isNull(venueRoleAssignments.effectiveTo),
      ),
    )
    .limit(1);
  if (existing) {
    return json({ error: "Assignment already active" }, 409);
  }

  const [created] = await getDb()
    .insert(venueRoleAssignments)
    .values({
      organizationId: auth.organizationId,
      venueId,
      roleId: parsed.data.roleId,
      userId: parsed.data.userId,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  return json({ assignment: created }, 201);
};
