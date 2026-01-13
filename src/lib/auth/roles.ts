import type { APIContext } from "astro";
import { db } from "@/lib/db";
import { userRoles, roles, teams } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
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
