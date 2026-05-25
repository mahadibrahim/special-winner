import type { RoleName, UserRole } from "./roles";

/**
 * Pick a single "primary" role name from a user's role set.
 *
 * Many admin surfaces only display one role at a time — the sidebar
 * picker (`getSidebarForRole`), the role-aware home redirects, the
 * dashboard greeting. The previous pattern was `userRoles[0]?.name`,
 * which depends on the physical row ordering returned by
 * `getUserRoles` — that SELECT has no `ORDER BY`, so a user with
 * multiple admin-tier rows could see different surfaces on different
 * requests. CLAUDE.md flags this exact "limit 1 with no orderBy"
 * pattern as a multi-tenant query hazard.
 *
 * This helper makes the choice deterministic and explicit. Order is
 * "most-privileged first" so that a user with both `super_admin` and
 * `coach` (e.g. a founder coaching a team) consistently gets the
 * super-admin surface.
 */
const PRECEDENCE: RoleName[] = [
  "super_admin",
  "location_admin",
  "media_editor",
  "media_staff",
  "coach",
  "player",
  "parent",
];

export function getPrimaryRoleName(
  userRoles: ReadonlyArray<Pick<UserRole, "name">> | null | undefined,
): RoleName | "parent" {
  if (!userRoles || userRoles.length === 0) return "parent";
  for (const candidate of PRECEDENCE) {
    if (userRoles.some((r) => r.name === candidate)) return candidate;
  }
  return "parent";
}
