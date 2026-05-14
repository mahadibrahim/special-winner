import type { APIRoute } from "astro";
import { getPublicSports, getPublicLocations } from "@/lib/programs/public-filters";

/**
 * Public filter options for the homepage / programs directory.
 *
 * Returns sports + locations that have at least one open or active season
 * attached, so the filter UI never shows a venue with nothing to register
 * for. The queries live in @/lib/programs/public-filters so the /sports and
 * /locations index pages can call them directly without an HTTP round-trip.
 */
export const GET: APIRoute = async () => {
  const [sports, locations] = await Promise.all([
    getPublicSports(),
    getPublicLocations(),
  ]);

  return new Response(JSON.stringify({ sports, locations }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
