/**
 * Resolve a kiosk URL segment to its facility (location). The segment is
 * either the location's human-friendly `slug` (e.g. /kiosk/worthington)
 * or its UUID — both resolve, so older UUID kiosk URLs keep working. The
 * segment isn't a secret; it scopes every kiosk query to one facility.
 *
 * MULTI-TENANCY: `locations.slug` is unique only PER ORGANIZATION
 * (unique().on(organizationId, slug) — see schema/organizations.ts), so a
 * bare `eq(locations.slug, …)` is a cross-tenant hazard: two orgs can both
 * own a location slugged `hq`, and /kiosk/hq would resolve to whichever row
 * the planner happened to return — after which /api/kiosk/hq/search lists
 * THAT org's customers. Every caller therefore passes the organization the
 * middleware resolved from the request host, and the lookup is scoped to it.
 * The UUID path is scoped too: a globally-unique id from another tenant is
 * still another tenant's facility.
 *
 * If the host resolves no organization at all (`organizationId` null — a
 * brand-new domain, or a resolver outage), we fall back to the unscoped
 * lookup but pin it with a deterministic orderBy, so it can at least never
 * silently pick a DIFFERENT row between two requests.
 */
import { and, asc, eq } from "drizzle-orm";
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

export async function requireKioskLocation(
  slug: string,
  organizationId: string | null | undefined,
) {
  const isUuid = UUID_RX.test(slug);
  if (!isUuid && !SLUG_RX.test(slug)) return notFound();

  const segmentMatch = isUuid
    ? eq(locations.id, slug)
    : eq(locations.slug, slug.toLowerCase());

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
      organizationId
        ? and(segmentMatch, eq(locations.organizationId, organizationId))
        : segmentMatch,
    )
    // Deterministic even in the unscoped fallback — never let a shared DB
    // hand two requests two different facilities for one URL.
    .orderBy(asc(locations.createdAt))
    .limit(1);
  if (!row || !row.active) return notFound();
  return { ok: true as const, location: row };
}
