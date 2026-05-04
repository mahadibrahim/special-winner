import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { sports, locations, programs, seasons } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Public filter options for the homepage / programs directory.
 *
 * Returns sports + locations that have at least one open or active season
 * attached, so the filter UI never shows a venue with nothing to register
 * for. Soft-fails to a minimal fallback if the DB is unreachable.
 */

const FALLBACK_SPORTS: Array<{
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}> = [];

const FALLBACK_LOCATIONS: Array<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
  sortOrder: number | null;
}> = [];

export const GET: APIRoute = async () => {
  try {
    if (!db) throw new Error("No DB");

    // Sports: only include those that have at least one active program with
    // at least one open/active season — keeps the filter aligned with what's
    // actually registrable today.
    const sportRows = await db
      .selectDistinct({
        id: sports.id,
        name: sports.name,
        slug: sports.slug,
        icon: sports.icon,
        color: sports.color,
      })
      .from(sports)
      .innerJoin(programs, eq(programs.sportId, sports.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active')`,
        ),
      );

    const locationRows = await db
      .selectDistinct({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        description: locations.description,
        city: locations.city,
        state: locations.state,
        latitude: locations.latitude,
        longitude: locations.longitude,
        sortOrder: locations.sortOrder,
      })
      .from(locations)
      .innerJoin(programs, eq(programs.locationId, locations.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(locations.active, true),
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active')`,
        ),
      )
      .orderBy(locations.sortOrder, locations.name);

    return new Response(
      JSON.stringify({
        sports: sportRows.length > 0 ? sportRows : FALLBACK_SPORTS,
        locations: locationRows.length > 0 ? locationRows : FALLBACK_LOCATIONS,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error fetching public filters:", err);
    return new Response(
      JSON.stringify({ sports: FALLBACK_SPORTS, locations: FALLBACK_LOCATIONS }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
};
