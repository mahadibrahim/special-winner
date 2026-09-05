/**
 * Task 4 of the 2026-09-05-coach-classes-phase01 plan: shared "who can be a
 * coach" picker recipe, based on the two-lookup-merged-and-deduped shape at
 * `src/pages/admin/teams/index.astro:34-95` (that page is left untouched —
 * this is a copy, not a refactor-in-place, so the teams page's behavior
 * cannot regress from this extraction).
 *
 * Two independent lookups, merged and deduped:
 *   1. Users holding the `coach` role SCOPED TO THIS ORG (`users` ⋈
 *      `userRoles` ⋈ `roles`, filtered on `userRoles.scopeType === "organization"`
 *      AND `userRoles.scopeId === organizationId` — the exact same condition
 *      `isOrgCoachingStaff` (src/lib/auth/roles.ts) uses as the staffing PUT
 *      endpoints' write-time validity gate. `selectDistinct` because a coach
 *      can hold multiple `coach` `userRoles` rows at different scopes, which
 *      would otherwise duplicate them in the result).
 *
 *      DEVIATION FROM THE TEAMS PAGE: the teams page instead scopes this
 *      lookup via `inArray(users.id, orgUserIds)` (`user_organization_access`
 *      membership). That's a DIFFERENT scoping mechanism from the role's own
 *      `scopeType`/`scopeId`, and in practice they can diverge — the seeded
 *      `coach@test.aspiresports.com` / `training+coach@test.aspiresports.com`
 *      fixtures hold a real org-scoped `coach` role but have ZERO
 *      `user_organization_access` rows, so the teams page's literal recipe
 *      would silently omit them from the picker entirely (verified against
 *      the e2e seed while building this task). Scoping by the role's actual
 *      scope instead of org-access membership means every id this function
 *      returns for "lookup 1" is guaranteed to pass `isOrgCoachingStaff` —
 *      no candidate that visibly IS a coach can 422 when picked as lead.
 *   2. Every other user with `user_organization_access` in this org (capped
 *      at 100, matching the teams page) — "also include admins as potential
 *      coaches" per the original recipe's comment, kept as-is (broader org
 *      membership, not role-based) since it's a secondary/fallback pool, not
 *      the thing this task needed fixed.
 *
 * NOTE for callers: this still returns CANDIDATES for a picker, not a full
 * validity guarantee — an id surfaced only via lookup 2 (a non-coach org
 * member) can still 422 from the staffing PUT endpoints if selected. Only
 * lookup 1 (the coach-role list) is guaranteed valid.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema/users";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";

export interface CoachCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/**
 * Returns coach-picker candidates for `organizationId`: org-scoped `coach`
 * role holders first, then every other org member (capped at 100),
 * deduplicated by user id. Returns `[]` for a null/empty `organizationId`
 * rather than falling back to a platform-wide unscoped query — unlike the
 * teams page (whose `orgId` comes from middleware and is expected to always
 * be present for an authenticated admin request), this is a reusable helper
 * and must not silently leak every org's users if a caller passes no org.
 */
export async function getOrgCoachCandidates(
  organizationId: string | null | undefined,
): Promise<CoachCandidate[]> {
  if (!organizationId) return [];

  const db = getDb();
  const orgUserIds = db
    .select({ id: userOrganizationAccess.userId })
    .from(userOrganizationAccess)
    .where(eq(userOrganizationAccess.organizationId, organizationId));

  const [coachesFromRoles, allUsers] = await Promise.all([
    db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      ),

    // Also include admins as potential coaches
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, orgUserIds))
      .orderBy(asc(users.lastName), asc(users.firstName))
      .limit(100),
  ]);

  const candidates: CoachCandidate[] = [...coachesFromRoles];
  const seenIds = new Set(candidates.map((c) => c.id));
  for (const u of allUsers) {
    if (!seenIds.has(u.id)) {
      candidates.push(u);
      seenIds.add(u.id);
    }
  }

  return candidates;
}
