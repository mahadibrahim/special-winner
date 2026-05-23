/**
 * Resolve a kiosk URL segment to its facility (location). The segment is
 * either the location's human-friendly `slug` (e.g. /kiosk/worthington)
 * or its UUID — both resolve, so older UUID kiosk URLs keep working. The
 * segment isn't a secret; it scopes every kiosk query to one facility.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors the slug format the locations admin editor produces.
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

export async function requireKioskLocation(slug: string) {
  const isUuid = UUID_RX.test(slug);
  if (!isUuid && !SLUG_RX.test(slug)) return notFound();

  const [row] = await getDb()
    .select({
      id: locations.id,
      name: locations.name,
      active: locations.active,
      organizationId: locations.organizationId,
      timezone: locations.timezone,
    })
    .from(locations)
    .where(
      isUuid ? eq(locations.id, slug) : eq(locations.slug, slug.toLowerCase()),
    )
    .limit(1);
  if (!row || !row.active) return notFound();
  return { ok: true as const, location: row };
}
