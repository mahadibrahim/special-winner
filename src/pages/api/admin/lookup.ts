/**
 * GET /api/admin/lookup?q=<term>
 *
 * Unified search across an org's people (parents, coaches, super-admins,
 * players) by name and email. Backs the /admin/lookup page.
 *
 * Scope:
 *   - Users (accounts) — found via the same org-membership rules as
 *     /api/admin/users (global super-admins + org/location/program/team
 *     scoped roles + user_organization_access).
 *   - People (family_members) — limited to rows whose parentUserId or
 *     selfUserId is in that same user set. This catches both
 *     parent-of-child rows (COPPA path) and self-as-adult rows.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  users,
  userRoles,
  roles,
  locations,
  programs,
  teams,
  seasons,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { familyMembers } from "@/lib/db/schema/registrations";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

const MIN_Q_LENGTH = 2;
const MAX_RESULTS_PER_GROUP = 20;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < MIN_Q_LENGTH) {
    return new Response(
      JSON.stringify({ users: [], people: [], note: "Type at least 2 characters." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Same org-membership shape as /api/admin/users — see the comment there
    // for why globals + access rows both count.
    const orgLocations = await getDb()
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, orgContext.organizationId));
    const locationIds = orgLocations.map((l) => l.id);

    const orgPrograms = locationIds.length > 0
      ? await getDb()
          .select({ id: programs.id })
          .from(programs)
          .where(inArray(programs.locationId, locationIds))
      : [];
    const programIds = orgPrograms.map((p) => p.id);

    const orgSeasons = programIds.length > 0
      ? await getDb()
          .select({ id: seasons.id })
          .from(seasons)
          .where(inArray(seasons.programId, programIds))
      : [];
    const seasonIds = orgSeasons.map((s) => s.id);

    const orgTeams = seasonIds.length > 0
      ? await getDb()
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.seasonId, seasonIds))
      : [];
    const teamIds = orgTeams.map((t) => t.id);

    const orgUserRoles = await getDb()
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        or(
          eq(userRoles.scopeType, "global"),
          and(
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, orgContext.organizationId),
          ),
          ...(locationIds.length > 0
            ? [and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIds))]
            : []),
          ...(programIds.length > 0
            ? [and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIds))]
            : []),
          ...(teamIds.length > 0
            ? [and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIds))]
            : []),
        ),
      );

    const orgAccessRows = await getDb()
      .select({ userId: userOrganizationAccess.userId })
      .from(userOrganizationAccess)
      .where(eq(userOrganizationAccess.organizationId, orgContext.organizationId));

    const userIdsInOrg = [
      ...new Set([
        ...orgUserRoles.map((ur) => ur.userId),
        ...orgAccessRows.map((a) => a.userId),
      ]),
    ];

    if (userIdsInOrg.length === 0) {
      return new Response(
        JSON.stringify({ users: [], people: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const like = `%${q}%`;

    // --- Users (accounts) ---
    const userMatches = await getDb()
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(
        and(
          inArray(users.id, userIdsInOrg),
          or(
            ilike(users.email, like),
            ilike(users.firstName, like),
            ilike(users.lastName, like),
          ),
        ),
      )
      .limit(MAX_RESULTS_PER_GROUP);

    // Attach role names per matched user so the operator can tell parents
    // from coaches in the result list.
    const matchedUserIds = userMatches.map((u) => u.id);
    const userRoleRows = matchedUserIds.length > 0
      ? await getDb()
          .select({
            userId: userRoles.userId,
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(inArray(userRoles.userId, matchedUserIds))
      : [];
    const roleNamesByUser = new Map<string, string[]>();
    for (const row of userRoleRows) {
      const existing = roleNamesByUser.get(row.userId) ?? [];
      existing.push(row.roleName);
      roleNamesByUser.set(row.userId, existing);
    }
    const usersOut = userMatches.map((u) => ({
      ...u,
      roles: roleNamesByUser.get(u.id) ?? [],
    }));

    // --- People (family_members) ---
    // family_members rows whose parent or self user is in the org.
    const peopleMatches = await getDb()
      .select({
        id: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        birthDate: familyMembers.birthDate,
        parentUserId: familyMembers.parentUserId,
        selfUserId: familyMembers.selfUserId,
      })
      .from(familyMembers)
      .where(
        and(
          or(
            inArray(familyMembers.parentUserId, userIdsInOrg),
            inArray(familyMembers.selfUserId, userIdsInOrg),
          ),
          or(
            ilike(familyMembers.firstName, like),
            ilike(familyMembers.lastName, like),
          ),
        ),
      )
      .limit(MAX_RESULTS_PER_GROUP);

    return new Response(
      JSON.stringify({ users: usersOut, people: peopleMatches }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[/api/admin/lookup]", err);
    return new Response(
      JSON.stringify({ error: "Lookup failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
