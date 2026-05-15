/**
 * Resolve a kiosk URL slug to its venue. The slug is just the venue
 * UUID for v1 (no friendly slug column yet). The slug isn't a secret;
 * it scopes every query to one venue.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireKioskVenue(slug: string) {
  if (!UUID_RX.test(slug)) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: "Kiosk not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const [row] = await getDb()
    .select({
      id: venues.id,
      name: venues.name,
      active: venues.active,
      locationId: venues.locationId,
      organizationId: locations.organizationId,
    })
    .from(venues)
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .where(eq(venues.id, slug))
    .limit(1);
  if (!row || !row.active) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: "Kiosk not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true as const, venue: row };
}
