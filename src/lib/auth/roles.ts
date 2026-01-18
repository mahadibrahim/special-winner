import type { APIContext } from "astro";
import { db } from "@/lib/db";
import { userRoles, roles, teams, rosters, registrations, organizations } from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { validateSession } from "./session";

export type RoleName = "super_admin" | "location_admin" | "coach" | "parent" | "player";
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
  const result = await db
    .select({
      name: roles.name,
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  return result as UserRole[];
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
  const [team] = await db
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
  const coachTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      or(
        eq(teams.coachUserId, userId),
        eq(teams.assistantCoachUserId, userId)
      )
    );

  return coachTeams.map((t) => t.id);
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
 * Check if a player (familyMember) is on one of the coach's teams
 * This checks via rosters -> registrations -> familyMembers
 */
export async function isPlayerOnCoachTeam(
  coachTeamIds: string[],
  familyMemberId: string
): Promise<boolean> {
  if (coachTeamIds.length === 0) return false;

  const result = await db
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

  const result = await db
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
  const { user } = await validateSession(context);
  if (user) {
    const userRolesList = await getUserRoles(user.id);
    const isSuperAdmin = userRolesList.some((role) => role.name === "super_admin");

    if (isSuperAdmin) {
      // Super admin can access first org as fallback (for development)
      const firstOrg = await db.query.organizations.findFirst();
      return firstOrg?.id || null;
    }
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
