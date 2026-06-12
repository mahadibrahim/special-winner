/**
 * SoccerOne routing — the single source of truth for "what's a SoccerOne
 * host" and "what does it rewrite to."
 *
 * SoccerOne is a *brand skin*, not a tenant: gosoccerone.com resolves to
 * the same Aspire org as the main site and serves the same inventory
 * (programs, drop-ins, rentals, memberships). Everything brand-specific is
 * keyed off the request host — the org slug plays no role in routing.
 * (Single-org cutover, 2026-06-11. Phase 1 spec §6 originally modeled
 * SoccerOne as a separate org; that model is retired.)
 *
 * All functions are pure (no DB, no I/O) so they can be unit-tested without
 * the dev server. The middleware composes their outputs into real
 * `context.rewrite()` / `context.redirect()` calls.
 */

/** Hostnames that get the SoccerOne brand skin. */
export const SOCCERONE_HOSTS: readonly string[] = [
  "gosoccerone.com",
  "www.gosoccerone.com",
  // Dev/e2e only: *.localhost resolves to loopback in Chromium and
  // modern OS resolvers, so the brand skin can be exercised in a real
  // browser and in Playwright without DNS or Host-header spoofing.
  // Never publicly routable — harmless in prod.
  "soccerone.localhost",
] as const;

/** Canonical SoccerOne host (apex 308-redirects to this). */
export const SOCCERONE_CANONICAL_HOST = "www.gosoccerone.com" as const;

/**
 * Marketing-root paths on a SoccerOne host that get rewritten into the
 * `soccerone/*` subtree. Exact-match only — anything not in this table
 * passes through unchanged (shared routes like /register, /rentals,
 * /dropin, /signin, /dashboard, /api/* are NOT rewritten).
 */
export const SOCCERONE_MARKETING_REWRITES: Readonly<Record<string, string>> = {
  "/": "/soccerone",
  "/leagues": "/soccerone/leagues",
  "/rent": "/soccerone/rent",
  "/pickup": "/soccerone/pickup",
  "/memberships": "/soccerone/memberships",
  "/downtown": "/soccerone/downtown",
  "/worthington": "/soccerone/worthington",
} as const;

function normalizeHost(host: string): string {
  return host.split(":")[0].toLowerCase();
}

/**
 * True if the request host (raw `Host` header — port suffix tolerated) is
 * one of the SoccerOne brand domains. This is THE brand check: routing,
 * GTM container selection, and charge brand-attribution all key off it.
 */
export function isSoccerOneHost(host: string): boolean {
  return SOCCERONE_HOSTS.includes(normalizeHost(host));
}

/**
 * Brand label for Stripe charge metadata, derived from the request host.
 * Both brands charge into the one shared Stripe account; this is the only
 * signal distinguishing them now that they share a single org.
 */
export function brandFromHost(host: string): "soccerone" | "aspire" {
  return isSoccerOneHost(host) ? "soccerone" : "aspire";
}

/**
 * Normalize a raw brand string (e.g. Stripe `metadata.brand`, which is
 * untyped and may be absent on pre-cutover charges) to a brand id.
 * The single place that owns the metadata-string → brand mapping.
 */
export function normalizeBrand(
  raw: string | null | undefined,
): "soccerone" | "aspire" {
  return raw === "soccerone" ? "soccerone" : "aspire";
}

/**
 * Canonical origin for a brand label, for contexts with no request to
 * derive it from (Stripe webhooks, cron). Returns null for any non-SoccerOne
 * brand — callers fall back to PUBLIC_APP_URL (the Aspire origin).
 */
export function originForBrand(brand: string | null | undefined): string | null {
  return brand === "soccerone" ? `https://${SOCCERONE_CANONICAL_HOST}` : null;
}

/**
 * If the pathname is a SoccerOne marketing root, return the path inside
 * `src/pages/soccerone/*` that should render it. Otherwise null.
 *
 * Caller responsibility: gate this on `isSoccerOneHost(host)` (so
 * non-SoccerOne hosts hitting the same path are unaffected).
 */
export function rewriteSoccerOnePath(pathname: string): string | null {
  return SOCCERONE_MARKETING_REWRITES[pathname] ?? null;
}

/**
 * If the pathname is `/soccerone` or `/soccerone/<something>`, return the
 * canonical `https://www.gosoccerone.com/<...>` URL for a 301 redirect from
 * the Aspire host. Otherwise null.
 *
 * Caller responsibility: gate this on the request host being an Aspire host
 * (so SoccerOne-host requests to /soccerone/* aren't redirected to
 * themselves).
 */
export function getAspireToSoccerOneRedirect(pathname: string): string | null {
  if (pathname === "/soccerone") {
    return `https://${SOCCERONE_CANONICAL_HOST}/`;
  }
  if (pathname.startsWith("/soccerone/")) {
    const suffix = pathname.slice("/soccerone".length); // includes the leading "/"
    return `https://${SOCCERONE_CANONICAL_HOST}${suffix}`;
  }
  return null;
}

// NOTE: the Phase-1 `isUnmappedSoccerOneHost` 404-guard is gone. It existed
// to stop a SoccerOne host from silently serving Aspire content when the
// SoccerOne org's domain mapping was missing — under the single-org model,
// Aspire content on a SoccerOne host IS the design (same inventory, brand
// skin applied by host), so there is no wrong-content state left to guard.
