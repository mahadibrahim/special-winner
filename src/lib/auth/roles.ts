import type { APIContext } from "astro";
import { getDb } from "@/lib/db";
import { userRoles, roles, teams, rosters, registrations, organizations } from "@/lib/db/schema";
import { eq, and, or, inArray, asc } from "drizzle-orm";
import { validateSession } from "./session";

export type RoleName =
  | "super_admin"
  | "location_admin"
  | "coach"
  | "parent"
  | "player"
  | "media_staff"
  | "media_editor"
  | "referee";
export type ScopeType = "global" | "organization" | "location" | "program" | "team";

export interface UserRole {
  name: RoleName;
  scopeType: ScopeType;
  scopeId: string | null;
}

/**
 * Get all roles assigned to a user
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  try {
    const result = await getDb()
      .select({
        name: roles.name,
        scopeType: userRoles.scopeType,
        scopeId: userRoles.scopeId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return result as UserRole[];
  } catch (error) {
    // Database not available - return empty roles
    console.error("Error fetching user roles (database may be unavailable):", error);
    return [];
  }
}

/**
 * Check if a user has a specific role (optionally scoped)
 */
export async function hasRole(
  userId: string,
  roleName: RoleName,
  scopeType?: ScopeType,
  scopeId?: string
): Promise<boolean> {
  const userRolesList = await getUserRoles(userId);

  return userRolesList.some((role) => {
    if (role.name !== roleName) return false;
    if (scopeType && role.scopeType !== scopeType) return false;
    if (scopeId && role.scopeId !== scopeId) return false;
    return true;
  });
}

/**
 * Check if a user is a coach or assistant coach of a specific team
 * This checks the teams table directly (denormalized coach assignment)
 */
export async function isCoachOfTeam(userId: string, teamId: string): Promise<boolean> {
  const [team] = await getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.id, teamId),
        or(
          eq(teams.coachUserId, userId),
          eq(teams.assistantCoachUserId, userId)
        )
      )
    );

  return !!team;
}

/**
 * Get all team IDs where the user is coach or assistant coach
 */
export async function getCoachTeamIds(userId: string): Promise<string[]> {
  try {
    const coachTeams = await getDb()
      .select({ id: teams.id })
      .from(teams)
      .where(
        or(
          eq(teams.coachUserId, userId),
          eq(teams.assistantCoachUserId, userId)
        )
      );

    return coachTeams.map((t) => t.id);
  } catch (error) {
    // Database not available - return empty array
    console.error("Error fetching coach team IDs (database may be unavailable):", error);
    return [];
  }
}

/**
 * Check if user is a coach of any team
 */
export async function isCoach(userId: string): Promise<boolean> {
  const teamIds = await getCoachTeamIds(userId);
  return teamIds.length > 0;
}

/**
 * Middleware helper to validate coach access
 * Returns user info and their team IDs if they are a coach
 */
export async function validateCoachAccess(context: APIContext): Promise<{
  user: Awaited<ReturnType<typeof validateSession>>["user"];
  isCoach: boolean;
  teamIds: string[];
}> {
  const { user } = await validateSession(context);

  if (!user) {
    return { user: null, isCoach: false, teamIds: [] };
  }

  const teamIds = await getCoachTeamIds(user.id);
  const isCoachResult = teamIds.length > 0;

  return { user, isCoach: isCoachResult, teamIds };
}

/**
 * Check if user has admin access (super_admin or location_admin)
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const userRolesList = await getUserRoles(userId);
  return userRolesList.some(
    (role) => role.name === "super_admin" || role.name === "location_admin"
  );
}

/**
 * Middleware helper to validate admin access
 * Returns user info and admin status
 */
export async function validateAdminAccess(context: APIContext): Promise<{
  user: Awaited<ReturnType<typeof validateSession>>["user"];
  isAdmin: boolean;
  roles: UserRole[];
}> {
  const { user } = await validateSession(context);

  if (!user) {
    return { user: null, isAdmin: false, roles: [] };
  }

  const userRolesList = await getUserRoles(user.id);
  const isAdminResult = userRolesList.some(
    (role) => role.name === "super_admin" || role.name === "location_admin"
  );

  return { user, isAdmin: isAdminResult, roles: userRolesList };
}

/**
 * Helper to require admin access for API routes
 * Returns an error Response if not authorized, or the user/roles if authorized
 */
export async function requireAdminAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>; roles: UserRole[] }
> {
  const { user, isAdmin: hasAdminRole, roles } = await validateAdminAccess(context);

  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }

  if (!hasAdminRole) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 }),
    };
  }

  return { authorized: true, user, roles };
}

/**
 * Stricter sibling of `requireAdminAccess` — only super_admins pass.
 *
 * Use on API endpoints whose data is org-wide and not per-location
 * (registrations roll-ups, teams catalog, payment ledger, announcements
 * write surface, etc.). The corresponding pages are locked to
 * super-admin in middleware (`SUPER_ADMIN_ONLY_PREFIXES`), but APIs
 * skip the middleware route rules and have to enforce the same tier
 * themselves — otherwise a `location_admin`'s session token alone is
 * enough to fetch the data via `curl`.
 */
export async function requireSuperAdminAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>; roles: UserRole[] }
> {
  const adminResult = await requireAdminAccess(context);
  if (!adminResult.authorized) return adminResult;

  const hasSuper = adminResult.roles.some((r) => r.name === "super_admin");
  if (!hasSuper) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: Super-admin access required" }),
        { status: 403 },
      ),
    };
  }

  return adminResult;
}

/**
 * Check if a player (familyMember) is on one of the coach's teams
 * This checks via rosters -> registrations -> familyMembers
 */
export async function isPlayerOnCoachTeam(
  coachTeamIds: string[],
  familyMemberId: string
): Promise<boolean> {
  if (coachTeamIds.length === 0) return false;

  const result = await getDb()
    .select({ id: rosters.id })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .where(
      and(
        inArray(rosters.teamId, coachTeamIds),
        eq(registrations.familyMemberId, familyMemberId)
      )
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get all family member IDs that are on the coach's teams
 */
export async function getCoachPlayerIds(coachTeamIds: string[]): Promise<string[]> {
  if (coachTeamIds.length === 0) return [];

  const result = await getDb()
    .select({ familyMemberId: registrations.familyMemberId })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .where(inArray(rosters.teamId, coachTeamIds));

  return result.map((r) => r.familyMemberId);
}

/**
 * Helper to require coach access for API routes
 * Returns an error Response if not authorized, or the user/teamIds if authorized
 */
export async function requireCoachAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>; teamIds: string[] }
> {
  const { user, isCoach: hasCoachRole, teamIds } = await validateCoachAccess(context);

  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }

  if (!hasCoachRole) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden: Coach access required" }), { status: 403 }),
    };
  }

  return { authorized: true, user, teamIds };
}

/**
 * Helper to require coach access AND verify player belongs to coach's team
 */
export async function requireCoachAccessToPlayer(
  context: APIContext,
  familyMemberId: string
): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>; teamIds: string[] }
> {
  const coachResult = await requireCoachAccess(context);
  if (!coachResult.authorized) return coachResult;

  const hasAccess = await isPlayerOnCoachTeam(coachResult.teamIds, familyMemberId);
  if (!hasAccess) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: Player not on your team" }),
        { status: 403 }
      ),
    };
  }

  return coachResult;
}

/**
 * Helper to require coach access AND verify team belongs to coach
 */
export async function requireCoachAccessToTeam(
  context: APIContext,
  teamId: string
): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>; teamIds: string[] }
> {
  const coachResult = await requireCoachAccess(context);
  if (!coachResult.authorized) return coachResult;

  if (!coachResult.teamIds.includes(teamId)) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: Not your team" }),
        { status: 403 }
      ),
    };
  }

  return coachResult;
}

/**
 * Coach-portal access for endpoints that must be reachable BEFORE a coach
 * has any team assignment (e.g. the onboarding checklist — Phase 2 of the
 * coach-lifecycle program). `requireCoachAccess` authorizes on
 * teamIds.length > 0 only, which is correct for team-scoped data endpoints
 * but wrong here: a freshly hired coach has the `coach` role (stamped by
 * the Phase 1 hire handoff) before any team assignment, and must still be
 * able to load their checklist. Mirrors the OR-logic middleware.ts already
 * uses for the /coach page-access rule (role OR teamIds).
 */
export async function requireCoachPortalAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | {
      authorized: true;
      user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>;
      teamIds: string[];
      organizationId: string;
    }
> {
  const { user, isCoach: hasTeams, teamIds } = await validateCoachAccess(context);

  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }

  const userRolesList = await getUserRoles(user.id);
  const hasCoachRole = userRolesList.some((r) => r.name === "coach");

  if (!hasTeams && !hasCoachRole) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: Coach access required" }),
        { status: 403 },
      ),
    };
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) {
    return { authorized: false, response: orgContext.response };
  }

  return {
    authorized: true,
    user,
    teamIds,
    organizationId: orgContext.organizationId,
  };
}

/**
 * Staff-portal access for the in-app incident reporting surface (`/staff/**`
 * pages + `/api/staff/**` endpoints). Admits the three roles that can be
 * "on the ground" at a venue and responsible for filing an incident report:
 * super_admin, location_admin (venue manager), and coach — `role.event_lead`
 * from the ops catalog has no dedicated app role, so it maps to `coach`
 * (see the incident-reporting plan's key decisions). Mirrors
 * `requireCoachPortalAccess`'s shape (auth + resolved organizationId) but
 * without the coach-specific team-assignment fallback logic, since none of
 * the three admitted roles require it here.
 */
export async function requireStaffAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | {
      authorized: true;
      user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>;
      roles: UserRole[];
      organizationId: string;
    }
> {
  const { user } = await validateSession(context);

  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }

  const userRolesList = await getUserRoles(user.id);
  const hasStaffRole = userRolesList.some(
    (r) => r.name === "super_admin" || r.name === "location_admin" || r.name === "coach",
  );

  if (!hasStaffRole) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: staff access required" }),
        { status: 403 },
      ),
    };
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) {
    return { authorized: false, response: orgContext.response };
  }

  return {
    authorized: true,
    user,
    roles: userRolesList,
    organizationId: orgContext.organizationId,
  };
}

/**
 * Get the organization ID from context or fallback to first org for super_admins
 * Returns the organization ID that should be used for filtering queries
 */
export async function getOrganizationId(context: APIContext): Promise<string | null> {
  // First try to get from context (set by domain resolver in middleware)
  const org = context.locals.organization;
  if (org?.id) {
    return org.id;
  }

  // Fallback: For super_admins in development/localhost, get first org
  try {
    const { user } = await validateSession(context);
    if (user) {
      const userRolesList = await getUserRoles(user.id);
      const isSuperAdmin = userRolesList.some((role) => role.name === "super_admin");

      if (isSuperAdmin) {
        // Super admin can access oldest org as fallback (for development /
        // CI where no domain maps to an org). Ordered by createdAt so
        // shared test DBs with multiple orgs resolve deterministically.
        const firstOrg = await getDb().query.organizations.findFirst({
          orderBy: (o) => asc(o.createdAt),
        });
        return firstOrg?.id || null;
      }
    }
  } catch (error) {
    // Database not available
    console.error("Error getting organization ID (database may be unavailable):", error);
  }

  return null;
}

/**
 * Require organization context for admin APIs
 * Returns the organization ID or an error response
 */
export async function requireOrganizationContext(context: APIContext): Promise<
  | { hasOrganization: false; response: Response }
  | { hasOrganization: true; organizationId: string }
> {
  const organizationId = await getOrganizationId(context);

  if (!organizationId) {
    return {
      hasOrganization: false,
      response: new Response(
        JSON.stringify({ error: "Organization context required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { hasOrganization: true, organizationId };
}

/**
 * Org-scoped admin check.
 *
 * `validateAdminAccess`/`isAdmin` are org-INDEPENDENT: they return true if the
 * user holds an admin role in ANY organization. That is the right primitive
 * for "is this person staff at all", but on its own it does NOT establish that
 * the caller administers the *specific* org a request is scoped to — which is
 * why admin endpoints must additionally pin every resource to the resolved org.
 *
 * This helper closes that gap at the role layer: it returns true only when the
 * user administers `organizationId`:
 *   - a platform `super_admin` (global scope) administers every org, OR
 *   - a `super_admin`/`location_admin` role scoped to this organization.
 *
 * Admin roles in this codebase are stored at `scopeType: "organization"`
 * (location/media roles use `scopeType: "location"`); see the role seed. A
 * location-scoped admin role is not a pattern used here, so it is intentionally
 * not granted org authority without an explicit location→org resolution.
 */
export function isAdminForOrg(
  roles: UserRole[],
  organizationId: string | null,
): boolean {
  return roles.some((role) => {
    if (role.name !== "super_admin" && role.name !== "location_admin") {
      return false;
    }
    // Platform-wide super admin administers every organization.
    if (role.name === "super_admin" && role.scopeType === "global") {
      return true;
    }
    if (!organizationId) return false;
    return role.scopeType === "organization" && role.scopeId === organizationId;
  });
}

/**
 * Require that the caller is an admin OF THE RESOLVED ORGANIZATION.
 *
 * Composes the existing primitives into the org-aware guard new endpoints
 * should prefer over `requireAdminAccess` (global) + a manual org pin:
 *   1. `requireAdminAccess` — authenticated AND holds some admin role (401/403)
 *   2. `requireOrganizationContext` — a host/context org is resolved (400)
 *   3. `isAdminForOrg` — that admin role actually covers THIS org (403)
 *
 * Returns the resolved `organizationId` so the caller can pin resources to it.
 */
export async function requireOrgAdminAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | {
      authorized: true;
      user: NonNullable<Awaited<ReturnType<typeof validateSession>>["user"]>;
      roles: UserRole[];
      organizationId: string;
    }
> {
  const adminResult = await requireAdminAccess(context);
  if (!adminResult.authorized) return adminResult;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) {
    return { authorized: false, response: orgContext.response };
  }

  if (!isAdminForOrg(adminResult.roles, orgContext.organizationId)) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: not an admin of this organization" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return {
    authorized: true,
    user: adminResult.user,
    roles: adminResult.roles,
    organizationId: orgContext.organizationId,
  };
}
