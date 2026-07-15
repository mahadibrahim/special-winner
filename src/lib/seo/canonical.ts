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
  const origin = originForBrand(brandId) ?? aspireOrigin;
  const shortPath =
    brandId === "soccerone"
      ? getSoccerOneCanonicalRedirect(pathname) ?? pathname
      : pathname;
  return origin + normalizePath(shortPath);
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}
