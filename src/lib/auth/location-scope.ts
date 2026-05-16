import { getDb } from "@/lib/db";
import { userRoles } from "@/lib/db/schema/users";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

/**
 * Returns the list of location IDs a user is scoped to.
 *
 * Two paths:
 *   - location-scoped rows (`scopeType='location'`): the scopeId IS the
 *     location id. Pick it up directly.
 *   - organization-scoped rows (`scopeType='organization'`): the user
 *     manages every location in that org. Expand to the full set of
 *     location ids under each scoped org.
 *
 * Used by requireSameLocation + admin nav scoping. Returns [] for users
 * with neither kind of scope — super_admins typically fall here, and
 * are gated elsewhere by role check, not by this list.
 */
export async function getLocationIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        or(
          eq(userRoles.scopeType, "location"),
          eq(userRoles.scopeType, "organization"),
        ),
        isNotNull(userRoles.scopeId),
      ),
    );

  const directLocationIds: string[] = [];
  const orgIds: string[] = [];
  for (const r of rows) {
    if (!r.scopeId) continue;
    if (r.scopeType === "location") directLocationIds.push(r.scopeId);
    else if (r.scopeType === "organization") orgIds.push(r.scopeId);
  }

  // Expand org-scoped rows to the locations they cover.
  let orgScopedLocationIds: string[] = [];
  if (orgIds.length > 0) {
    const locRows = await getDb()
      .select({ id: locations.id })
      .from(locations)
      .where(inArray(locations.organizationId, orgIds));
    orgScopedLocationIds = locRows.map((l) => l.id);
  }

  // Dedupe — a user could be both location-scoped and org-scoped to a
  // covering org and we don't want the location id twice.
  return Array.from(new Set([...directLocationIds, ...orgScopedLocationIds]));
}
