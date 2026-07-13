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
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { familyMembers } from "@/lib/db/schema/registrations";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { buildOrgScopeCascade } from "@/lib/admin/org-scope-cascade";

export const prerender = false;

const MIN_Q_LENGTH = 2;
const MAX_RESULTS_PER_GROUP = 20;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < MIN_Q_LENGTH) {
    return new Response(
      JSON.stringify({ users: [], people: [], note: "Type at least 2 characters." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Scope the cascade to the caller's effective location set:
    //
    //   - super_admin with no pin → every location in the current org
    //   - super_admin with pin    → just the pinned location
    //   - non-super, no pin       → caller's full assigned location set
    //   - non-super, pinned       → just the pinned location
    //
    // Everything (programs → seasons → teams → role rows → people)
    // flows from `locationIds`, so narrowing here is sufficient. We
    // deliberately keep the org/global role-scope membership unchanged
    // below so the super-admin who supports a venue manager remains
    // findable regardless of picker state.
    //
    // Wave 1: resolve the picker/pin state, and (independently) the set of
    // every user with org-level access — the latter has no dependency on
    // locationIds at all.
    const [effectiveIds, orgAccessRows] = await Promise.all([
      getEffectiveLocationIds({
        userId: auth.user.id,
        userRoles: auth.roles,
        activeLocationId: context.locals.activeLocationId,
      }),
      getDb()
        .select({ userId: userOrganizationAccess.userId })
        .from(userOrganizationAccess)
        .where(eq(userOrganizationAccess.organizationId, auth.organizationId)),
    ]);

    let locationIds: string[];
    if (effectiveIds === null) {
      // Super-admin with no pin: show every location in the current org.
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, auth.organizationId));
      locationIds = orgLocations.map((l) => l.id);
    } else if (effectiveIds.length === 0) {
      return new Response(
        JSON.stringify({ users: [], people: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } else {
      locationIds = effectiveIds;
    }

    // programs → seasons → teams as nested subqueries, not separately
    // awaited round trips (see org-scope-cascade.ts — shared with
    // build-person-profile.ts's isUserInOrg).
    const { programIds, teamIds } = buildOrgScopeCascade(locationIds);

    const orgUserRoles = await getDb()
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        or(
          eq(userRoles.scopeType, "global"),
          and(
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, auth.organizationId),
          ),
          ...(locationIds.length > 0
            ? [and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIds))]
            : []),
          ...(programIds
            ? [and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIds))]
            : []),
          ...(teamIds
            ? [and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIds))]
            : []),
        ),
      );

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

    // --- Users + people, independent of each other ---
    const [userMatches, peopleMatches] = await Promise.all([
      getDb()
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
        .limit(MAX_RESULTS_PER_GROUP),

      // family_members rows whose parent or self user is in the org.
      getDb()
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
        .limit(MAX_RESULTS_PER_GROUP),
    ]);

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
