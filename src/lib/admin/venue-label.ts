import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";
import { asc, inArray } from "drizzle-orm";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

/**
 * Resolve a human label for the location(s) a venue-manager is scoped
 * to, suitable for the sidebar subtitle in `AdminLayout`.
 *
 *   - 0 locations  →  undefined  (super-admins fall here; the sidebar
 *                      shows "Super-admin" via its own branch)
 *   - 1 location   →  the location's name ("Downtown", "Worthington")
 *   - 2+ locations →  "N venues"  (the picker UI for switching between
 *                      them is a follow-up — see docs backlog)
 *
 * The query mirrors `getLocationIdsForUser` (expanding `organization`
 * scope to the underlying locations), so an org-scoped admin and a
 * location-scoped admin both label correctly.
 */
export async function resolveVenueLabel(
  userId: string,
): Promise<string | undefined> {
  const ids = await getLocationIdsForUser(userId);
  if (ids.length === 0) return undefined;

  const rows = await getDb()
    .select({ name: locations.name })
    .from(locations)
    .where(inArray(locations.id, ids))
    .orderBy(asc(locations.name));

  if (rows.length === 0) return undefined;
  if (rows.length === 1) return rows[0].name;
  return `${rows.length} venues`;
}
