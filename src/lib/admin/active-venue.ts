import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq, inArray } from "drizzle-orm";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import type { UserRole } from "@/lib/auth";

/**
 * Cookie name + max-age used to persist the venue picker selection. Kept
 * here so the middleware (read) and the set/clear API (write) agree.
 *
 * The cookie value is a location UUID, or empty/missing for "no pin".
 * One year max-age — picker state is "until the admin changes it",
 * which is closer to a preference than a session.
 */
export const ACTIVE_VENUE_COOKIE = "aspire_active_venue";
export const ACTIVE_VENUE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Validate a candidate location ID against the caller's scope.
 *
 *   - super_admin: any location in the caller's current org is valid.
 *   - non-super-admin: the location must be in `getLocationIdsForUser`.
 *
 * Returns the locationId if it's valid for this caller, else null. The
 * caller treats null as "no venue pinned" — same as a missing cookie.
 */
export async function validateActiveVenue(
  candidate: string | null | undefined,
  opts: {
    userId: string;
    userRoles: ReadonlyArray<Pick<UserRole, "name">>;
    organizationId: string | null;
  },
): Promise<string | null> {
  if (!candidate) return null;
  if (!opts.organizationId) return null;

  const isSuper = opts.userRoles.some((r) => r.name === "super_admin");

  if (isSuper) {
    // Super-admins can pin any location in the current org. Use a
    // bounded SELECT rather than reading every org location into memory.
    const [match] = await getDb()
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.id, candidate),
          eq(locations.organizationId, opts.organizationId),
        ),
      )
      .limit(1);
    return match?.id ?? null;
  }

  const allowed = await getLocationIdsForUser(opts.userId);
  return allowed.includes(candidate) ? candidate : null;
}

/**
 * Resolve the effective location-id filter for an admin caller.
 *
 *   - super_admin, no pin    →  null         (no filter; org-wide)
 *   - super_admin, pinned    →  [pinId]
 *   - non-super, no pin      →  caller's full location set (may be [])
 *   - non-super, pinned      →  [pinId]      (already validated upstream)
 *
 * Use this inside admin queries that want to respect both the venue
 * picker and the caller's underlying location scope. A return value of
 * `null` means "don't add a location filter"; `[]` means "no matches".
 */
export async function getEffectiveLocationIds(opts: {
  userId: string;
  userRoles: ReadonlyArray<Pick<UserRole, "name">>;
  activeLocationId: string | null;
}): Promise<string[] | null> {
  const isSuper = opts.userRoles.some((r) => r.name === "super_admin");
  if (opts.activeLocationId) return [opts.activeLocationId];
  if (isSuper) return null;
  return getLocationIdsForUser(opts.userId);
}

/**
 * Resolve every location the picker should offer. Returns an empty list
 * for callers with nothing to pick (single-venue location_admin, or an
 * unauthenticated request); the UI hides the picker in that case.
 */
export async function getPickableVenues(opts: {
  userId: string;
  userRoles: ReadonlyArray<Pick<UserRole, "name">>;
  organizationId: string | null;
}): Promise<Array<{ id: string; name: string }>> {
  if (!opts.organizationId) return [];
  const isSuper = opts.userRoles.some((r) => r.name === "super_admin");

  if (isSuper) {
    const rows = await getDb()
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.organizationId, opts.organizationId))
      .orderBy(locations.name);
    // Show the picker for super-admins only if the org actually has
    // more than one location — otherwise there's nothing to pick.
    return rows.length > 1 ? rows : [];
  }

  const ids = await getLocationIdsForUser(opts.userId);
  if (ids.length < 2) return [];
  const rows = await getDb()
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(inArray(locations.id, ids))
    .orderBy(locations.name);
  return rows;
}
