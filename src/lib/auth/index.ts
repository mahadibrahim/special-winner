export { lucia } from "./lucia";
export { hashPassword, verifyPassword } from "./password";
export { validateSession, createSession, invalidateSession } from "./session";
export { getPrimaryRoleName } from "./primary-role";
export {
  getUserRoles,
  hasRole,
  isCoachOfTeam,
  getCoachTeamIds,
  isCoach,
  validateCoachAccess,
  isAdmin,
  validateAdminAccess,
  requireAdminAccess,
  requireSuperAdminAccess,
  isPlayerOnCoachTeam,
  canCoachReachFamilyMember,
  getCoachPlayerIds,
  requireCoachAccess,
  requireCoachAccessToPlayer,
  requireCoachAccessToTeam,
  requireCoachPortalAccess,
  requireStaffAccess,
  getOrganizationId,
  requireOrganizationContext,
  isAdminForOrg,
  requireOrgAdminAccess,
  requireOrgWideAdminAccess,
  type RoleName,
  type ScopeType,
  type UserRole,
} from "./roles";
