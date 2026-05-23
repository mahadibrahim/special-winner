/**
 * Helper queries scoped to the SoccerOne org by slug. Used by the
 * soccerone/* marketing pages where Astro frontmatter needs a small
 * server-side query and we don't want to hand-roll SQL inline.
 *
 * Phase 2 of the SoccerOne / gosoccerone.com project.
 */
import { getDb } from "@/lib/db";
import { organizations, locations, venues, type Venue } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { SOCCERONE_ORG_SLUG } from "@/lib/organization/soccerone-routing";

/**
 * Returns rental-enabled venues at the given SoccerOne location slug.
 * Returns an empty array if the location doesn't exist or belongs to a
 * different org (defense-in-depth — the slug check is org-scoped via the
 * inner join on `organizations.slug = SOCCERONE_ORG_SLUG`).
 */
export async function getSoccerOneVenuesByLocation(
  locationSlug: string,
): Promise<Venue[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({ venue: venues })
    .from(venues)
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(
      and(
        eq(organizations.slug, SOCCERONE_ORG_SLUG),
        eq(locations.slug, locationSlug),
        eq(venues.rentalEnabled, true),
      ),
    )
    .orderBy(asc(venues.createdAt));

  return rows.map((r) => r.venue);
}
