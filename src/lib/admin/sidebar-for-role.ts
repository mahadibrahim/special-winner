import { SUPER_ADMIN_NAV, type NavGroup } from "./nav-super-admin";
import { VENUE_MANAGER_NAV } from "./nav-venue-manager";

/**
 * Returns the sidebar nav config for the given role.
 *
 * super_admin → full sidebar (6 groups, ~22 items).
 * Anything else → venue-manager sidebar (10 items). This is the safer default
 * — a user without an admin role is bounced by middleware before reaching
 * the layout anyway, but if they did slip through they'd see the minimal
 * surface, not the strategic one.
 */
export function getSidebarForRole(role: string | null | undefined): NavGroup[] {
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  return VENUE_MANAGER_NAV;
}
