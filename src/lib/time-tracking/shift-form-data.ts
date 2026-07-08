/**
 * Venue picker options for the /staff/shifts clock-in page. Mirrors the
 * location-scoping rule in src/lib/incidents/incident-form-data.ts:
 * location_admin sees only their own venues, coach/super_admin see every
 * venue in the org.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export interface ShiftVenueOption {
  id: string;
  name: string;
}

export async function getShiftVenueOptions(opts: {
  organizationId: string;
  userId: string;
  isLocationScoped: boolean;
}): Promise<ShiftVenueOption[]> {
  const db = getDb();

  if (opts.isLocationScoped) {
    const allowedLocationIds = await getLocationIdsForUser(opts.userId);
    if (allowedLocationIds.length === 0) return [];
    return db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(
        and(inArray(venues.locationId, allowedLocationIds), eq(venues.active, true)),
      )
      .orderBy(asc(venues.name));
  }

  return db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(and(eq(locations.organizationId, opts.organizationId), eq(venues.active, true)))
    .orderBy(asc(venues.name));
}
