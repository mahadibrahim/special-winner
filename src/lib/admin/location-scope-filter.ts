import { inArray, sql, type SQL } from "drizzle-orm";
import { venues } from "@/lib/db/schema/teams";

/**
 * Returns a Drizzle condition that limits a venue-joined query to the caller's
 * locations. `null` (super-admin) → undefined (no filter). Empty array → a
 * `false` condition (no rows), never "all rows".
 */
export function venueLocationCondition(locationIds: string[] | null): SQL | undefined {
  if (locationIds === null) return undefined;
  if (locationIds.length === 0) return sql`false`;
  return inArray(venues.locationId, locationIds);
}
