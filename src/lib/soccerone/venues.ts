/**
 * Helper queries for the soccerone/* marketing pages where Astro
 * frontmatter needs a small server-side query and we don't want to
 * hand-roll SQL inline.
 *
 * Single-org model: SoccerOne is a brand skin over the same org as the
 * main site, so callers scope by the resolved org from
 * `Astro.locals.organization` rather than a SoccerOne-specific slug.
 */
import { getDb } from "@/lib/db";
import { locations, venues, type Venue } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

/**
 * Returns rental-enabled venues at the given location slug within the
 * given org. Returns an empty array if the location doesn't exist or
 * belongs to a different org (the inner join enforces the org scope).
 */
export async function getRentalVenuesByLocation(
  organizationId: string,
  locationSlug: string,
): Promise<Venue[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({ venue: venues })
    .from(venues)
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.slug, locationSlug),
        eq(venues.rentalEnabled, true),
      ),
    )
    .orderBy(asc(venues.createdAt));

  return rows.map((r) => r.venue);
}
