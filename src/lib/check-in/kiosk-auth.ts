/**
 * Resolve a kiosk URL segment to its facility (location). The segment is
 * either the location's human-friendly `slug` (e.g. /kiosk/worthington)
 * or its UUID — both resolve, so older UUID kiosk URLs keep working. The
 * segment isn't a secret; it scopes every kiosk query to one facility.
 *
 * MULTI-TENANCY — what the hazard actually is. `locations.slug` is unique
 * only PER ORGANIZATION (unique().on(organizationId, slug) — see
 * schema/organizations.ts). So a bare `eq(locations.slug, …)` is unsafe not
 * because it serves a facility from an unexpected host (the slug is public;
 * an unscoped lookup was the original, intended behavior) but because two
 * orgs can BOTH own a location slugged `hq`, and /kiosk/hq would then
 * resolve to whichever row the planner happened to hand back — after which
 * /api/kiosk/hq/search lists THAT org's customers to the other tenant's
 * lobby. The leak is the AMBIGUOUS case, and only the ambiguous case.
 *
 * Purely org-scoping the lookup fixes the leak but introduces a worse
 * failure: the kiosk is a MOUNTED IPAD IN A LOBBY. `resolveOrganizationFromHost`
 * never returns null — on a miss it falls back to `resolveDefaultOrganization()`
 * (the oldest active HQ org) — so `locals.organization` is always *some* org,
 * just not necessarily the one that owns this facility. Under a bare
 * org-scoped lookup, any host/org mismatch (a new custom domain, a facility
 * moved between orgs, a device on the apex instead of the tenant subdomain)
 * hard-404s a device that worked yesterday. Nobody is at the kiosk to debug it.
 *
 * So the rule is: prefer the org, but only REFUSE when refusing is the only
 * safe answer.
 *   1. Look the segment up scoped to the request's organization. A hit is the
 *      normal, correct path — return it.
 *   2. No hit → look it up globally. If exactly ONE active location in the
 *      whole database carries that slug/UUID, return it. This is safe: the
 *      segment is not a secret, there is no other tenant it could have meant,
 *      and the alternative is a dead kiosk.
 *   3. More than one active match → 404. This is the hazard from the top of
 *      this comment. There is no basis to pick between two tenants, and
 *      guessing means serving one org's customers to the other's lobby, so we
 *      refuse rather than guess. (A tenant hitting this gets a 404 on its own
 *      correct host only if step 1 already missed — i.e. its host isn't mapped
 *      to its org, which is a config bug to fix, not something to paper over
 *      by coin-flipping between tenants.)
 *
 * Do NOT "simplify" this into either half: a bare global lookup reintroduces
 * the cross-tenant leak; a bare org-scoped lookup kills live kiosks.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema/organizations";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mirrors the slug format the locations admin editor produces.
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const COLUMNS = {
  id: locations.id,
  name: locations.name,
  active: locations.active,
  organizationId: locations.organizationId,
  timezone: locations.timezone,
};

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

  const db = getDb();

  // Step 1 — the request's own organization owns this segment. The normal path.
  if (organizationId) {
    const [scoped] = await db
      .select(COLUMNS)
      .from(locations)
      .where(and(segmentMatch, eq(locations.organizationId, organizationId)))
      // Unique per (org, slug), so at most one row — orderBy is belt-and-braces
      // for the shared-DB rule in CLAUDE.md.
      .orderBy(asc(locations.createdAt))
      .limit(1);
    // The org owns it: its active flag is the answer, full stop. An
    // intentionally deactivated facility must NOT fall through to step 2 and
    // get resolved to some other tenant's like-named location.
    if (scoped) return scoped.active ? { ok: true as const, location: scoped } : notFound();
  }

  // Step 2/3 — the request's org doesn't own this segment (or no org resolved).
  // Fall back globally, but ONLY when the answer is unambiguous. Take two rows:
  // one means "exactly one facility in the world can be meant" (safe); two
  // means two tenants share the slug and there is nothing to choose on (404).
  const matches = await db
    .select(COLUMNS)
    .from(locations)
    .where(and(segmentMatch, eq(locations.active, true)))
    .orderBy(asc(locations.createdAt))
    .limit(2);

  if (matches.length !== 1) return notFound();
  return { ok: true as const, location: matches[0] };
}
