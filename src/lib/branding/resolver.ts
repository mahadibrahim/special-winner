import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema/drop-in";
import { and, eq } from "drizzle-orm";

/**
 * Brand profile shape returned to consumers. Mirrors the columns we want
 * surfaced into `Astro.locals.brand`. We keep it explicit (rather than
 * `typeof brandProfiles.$inferSelect`) so the locals contract stays
 * decoupled from internal schema changes.
 */
export interface BrandProfile {
  id: string;
  organizationId: string;
  displayName: string;
  logoMediaId: string | null;
  heroCopy: unknown;
  colorTokens: unknown;
  footerCopy: string | null;
  featuredVenueIds: string[];
}

// In-memory TTL cache, same pattern as lib/organization/domain-resolver.ts.
// Module-level state survives warm Netlify invocations, so this removes the
// per-request brand lookup from the middleware hot path. Brand rows change
// rarely; a stale window is acceptable.
const cache = new Map<string, { data: BrandProfile | null; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): BrandProfile | null | undefined {
  const cached = cache.get(key);
  if (!cached) return undefined;
  if (Date.now() > cached.expiry) {
    cache.delete(key);
    return undefined;
  }
  return cached.data;
}

function setCache(key: string, data: BrandProfile | null) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

/**
 * Clear the brand cache (useful after brand profile changes).
 */
export function clearBrandCache(hostname?: string) {
  if (hostname) {
    cache.delete(hostname.toLowerCase());
  } else {
    cache.clear();
  }
}

/**
 * Resolve the active brand profile for an incoming hostname. Returns null
 * when no row matches — the page renders against the default org chrome.
 *
 * The hostname is matched exactly against `brand_profiles.domain`. Callers
 * should pass the lowercased host header (no port).
 */
export async function resolveBrandProfile(
  hostname: string,
): Promise<BrandProfile | null> {
  const cached = getCached(hostname);
  if (cached !== undefined) return cached;

  const db = getDb();
  const rows = await db
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.domain, hostname), eq(brandProfiles.active, true)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    setCache(hostname, null);
    return null;
  }

  const profile: BrandProfile = {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    logoMediaId: row.logoMediaId,
    heroCopy: row.heroCopy,
    colorTokens: row.colorTokens,
    footerCopy: row.footerCopy,
    featuredVenueIds: row.featuredVenueIds ?? [],
  };
  setCache(hostname, profile);
  return profile;
}
