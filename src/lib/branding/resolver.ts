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
  const db = getDb();
  const rows = await db
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.domain, hostname), eq(brandProfiles.active, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    logoMediaId: row.logoMediaId,
    heroCopy: row.heroCopy,
    colorTokens: row.colorTokens,
    footerCopy: row.footerCopy,
    featuredVenueIds: row.featuredVenueIds ?? [],
  };
}
