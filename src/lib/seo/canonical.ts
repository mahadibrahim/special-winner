import type { BrandId } from "@/lib/branding/themes";
import {
  originForBrand,
  getSoccerOneCanonicalRedirect,
} from "@/lib/organization/soccerone-routing";

/**
 * Absolute canonical URL for the current page.
 *
 * Origin is the brand's *canonical* host (not the raw request host): SoccerOne
 * → https://www.gosoccerone.com, Aspire → `aspireOrigin`
 * (PUBLIC_APP_URL). Using the canonical host means preview/branch deploys and
 * apex-vs-www variants all point search engines at the production URL.
 *
 * Path: on SoccerOne hosts the middleware rewrites the short public path
 * (/leagues) into the long-form /soccerone/leagues via next(), so the rendered
 * page observes the long form. `getSoccerOneCanonicalRedirect` (built from
 * SOCCERONE_MARKETING_REWRITES) maps it back to the short public path — the URL
 * we actually want indexed. Unmapped paths (shared routes like /register/*)
 * fall back to the rendered path unchanged.
 */
export function resolveCanonicalUrl(
  brandId: BrandId | null | undefined,
  pathname: string,
  aspireOrigin: string,
): string {
  const origin = originForBrand(brandId) ?? normalizeAspireOrigin(aspireOrigin);
  const normalized = normalizePath(pathname);
  const shortPath =
    brandId === "soccerone"
      ? getSoccerOneCanonicalRedirect(normalized) ?? normalized
      : normalized;
  return origin + shortPath;
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

/**
 * Force the Aspire origin to the apex host.
 *
 * `www.aspiresportsohio.com` 301-redirects to the apex at the Netlify domain
 * layer, so the apex is the only host that should ever appear in a canonical,
 * a sitemap `<loc>`, or an og:url. But `aspireOrigin` comes from
 * PUBLIC_APP_URL, and that value is environment-supplied — the Bitwarden
 * secret currently holds the `www` form. A canonical pointing at a host that
 * redirects is a self-contradicting signal and is the most likely origin of
 * apex-and-www both being indexed as separate pages.
 *
 * Stripping it here makes the whole class of bug unreachable regardless of how
 * PUBLIC_APP_URL is set. Only the Aspire brand is touched; SoccerOne's
 * canonical host is genuinely the www form and is resolved by originForBrand
 * before this runs.
 */
export function normalizeAspireOrigin(origin: string): string {
  return origin.replace(/^(https?:\/\/)www\./i, "$1").replace(/\/+$/, "");
}

/**
 * The Aspire origin to build absolute URLs from in page markup (JSON-LD `url`
 * and breadcrumb `item` values). Pages previously each rebuilt this from
 * PUBLIC_APP_URL inline, which meant a www-form env leaked www URLs into
 * structured data even after the canonical tag was fixed.
 */
export const ASPIRE_CANONICAL_ORIGIN = normalizeAspireOrigin(
  import.meta.env.PUBLIC_APP_URL || "https://aspiresportsohio.com",
);
