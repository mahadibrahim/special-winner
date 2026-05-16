import { getDb } from "@/lib/db";
import { userRoles } from "@/lib/db/schema/users";
import { and, eq, isNotNull } from "drizzle-orm";

/**
 * Returns the list of location IDs a user is scoped to via location_admin
 * (or any other location-scoped role) rows in user_roles.
 *
 * Used by requireSameLocation + admin nav scoping. Returns [] for users
 * with no location-scoped roles — super_admins typically fall here, and
 * are gated elsewhere by role check, not by this list.
 */
export async function getLocationIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ scopeId: userRoles.scopeId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.scopeType, "location"),
        isNotNull(userRoles.scopeId),
      ),
    );
  return rows.map((r) => r.scopeId!).filter((id): id is string => !!id);
}
