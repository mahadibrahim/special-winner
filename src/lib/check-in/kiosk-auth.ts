/**
 * Resolve a kiosk URL segment to its venue. The segment is either the
 * venue's human-friendly `slug` (e.g. `/kiosk/downtown`) or its UUID —
 * both resolve, so older UUID kiosk URLs keep working. The segment isn't
 * a secret; it scopes every query to one venue.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors the slug format enforced by the venue admin endpoint.
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function notFound() {
  return {
    ok: false as const,
    response: new Response(JSON.stringify({ error: "Kiosk not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  };
}

export async function requireKioskVenue(slug: string) {
  const isUuid = UUID_RX.test(slug);
  // Reject input that is neither a UUID nor a well-formed slug before it
  // reaches the query.
  if (!isUuid && !SLUG_RX.test(slug)) return notFound();

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
    .where(isUuid ? eq(venues.id, slug) : eq(venues.slug, slug.toLowerCase()))
    .limit(1);
  if (!row || !row.active) return notFound();
  return { ok: true as const, venue: row };
}
