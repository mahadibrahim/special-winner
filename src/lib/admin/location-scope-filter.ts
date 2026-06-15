import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { venues } from "@/lib/db/schema/teams";

/**
 * Returns a Drizzle condition that limits a query to the caller's locations,
 * matched on `column` (a `locations.id` or a joined `*.locationId`).
 *
 * The empty-set rule is the whole point of centralizing this: an empty array
 * means "no rows" (`sql`false``), NEVER "all rows". `null` (super-admin) means
 * "no filter" (`undefined`). Re-implementing this ternary inline is how an
 * all-rows leak gets reintroduced — always go through here.
 */
export function locationScopeCondition(
  column: AnyColumn,
  locationIds: string[] | null,
): SQL | undefined {
  if (locationIds === null) return undefined;
  if (locationIds.length === 0) return sql`false`;
  return inArray(column, locationIds);
}

/**
 * `locationScopeCondition` specialized to a `venues.locationId` join — the
 * common case for venue-scoped list queries (drop-in sessions, rentals).
 */
export function venueLocationCondition(locationIds: string[] | null): SQL | undefined {
  return locationScopeCondition(venues.locationId, locationIds);
}
