import { PORTALS, type Portal, type PortalId } from "./registry";

/**
 * The portals a user can access, in registry order (most-privileged first).
 * A portal matches if any of the user's role names is in its `roles` list and
 * the portal is `available`. De-duped by portal id (the two media roles map to
 * one media portal).
 */
export function resolvePortalsForUser(roleNames: string[]): Portal[] {
  const have = new Set(roleNames);
  return PORTALS.filter(
    (p) => p.available && p.roles.some((r) => have.has(r)),
  );
}

/**
 * Where a freshly-authenticated user belongs:
 *   0 portals → customer dashboard
 *   1 portal  → that portal's home (no hub flash)
 *   2+ portals → the landing hub
 */
export function resolvePostLoginTarget(roleNames: string[]): string {
  const portals = resolvePortalsForUser(roleNames);
  if (portals.length === 0) return "/dashboard";
  if (portals.length === 1) return portals[0].homeHref;
  return "/portal";
}

export function getPortalById(id: PortalId): Portal | undefined {
  return PORTALS.find((p) => p.id === id);
}
