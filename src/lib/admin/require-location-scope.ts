import { eq } from "drizzle-orm";
import type { APIContext } from "astro";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";

/**
 * Verify the caller may act on the resource that lives at `venueId`.
 *
 * - super-admin (effective scope = `null`): always allowed (no-op), so
 *   super-admin behavior is byte-unchanged.
 * - location-scoped caller (venue manager): the venue's location must be in
 *   their assigned set. A caller with no assigned locations is never allowed.
 *
 * Returns `true` when allowed. Callers map `false` → 404 (don't leak the
 * existence of resources outside the caller's locations).
 *
 * This is the single gate for write/action endpoints on venue-owned resources
 * (drop-in sessions, rentals). The list endpoints scope via
 * `venueLocationCondition`; this is its per-resource counterpart so that
 * enforcement is uniform rather than re-derived per endpoint.
 */
export async function callerCanActOnVenue(
  context: APIContext,
  venueId: string,
): Promise<boolean> {
  const scope = await getEffectiveLocationIds({
    userId: context.locals.user!.id,
    userRoles: context.locals.userRoles ?? [],
    activeLocationId: context.locals.activeLocationId ?? null,
  });
  if (scope === null) return true; // super-admin → unscoped
  if (scope.length === 0) return false; // no assigned locations → nothing
  const [venue] = await getDb()
    .select({ locationId: venues.locationId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue ? scope.includes(venue.locationId) : false;
}
