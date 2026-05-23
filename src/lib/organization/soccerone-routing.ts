/**
 * SoccerOne routing — the single source of truth for "what's a SoccerOne
 * host" and "what does it rewrite to."
 *
 * Phase 1 of the SoccerOne / gosoccerone.com project. Spec §6.
 *
 * All functions are pure (no DB, no I/O) so they can be unit-tested without
 * the dev server. The middleware composes their outputs into real
 * `context.rewrite()` / `context.redirect()` calls.
 */

/** Hostnames that should resolve to the SoccerOne tenant. */
export const SOCCERONE_HOSTS: readonly string[] = [
  "gosoccerone.com",
  "www.gosoccerone.com",
] as const;

/** Canonical SoccerOne host (apex 308-redirects to this). */
export const SOCCERONE_CANONICAL_HOST = "www.gosoccerone.com" as const;

/** Org slug that identifies the SoccerOne tenant in the `organizations` table. */
export const SOCCERONE_ORG_SLUG = "soccerone" as const;

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
 * If the pathname is a SoccerOne marketing root, return the path inside
 * `src/pages/soccerone/*` that should render it. Otherwise null.
 *
 * Caller responsibility: gate this on the resolved org being SoccerOne
 * (so non-SoccerOne hosts hitting the same path are unaffected).
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

/**
 * True if the request host is a known SoccerOne domain but the resolver
 * returned a different org (or nothing). This catches the case where the
 * SoccerOne `domain_mappings` row is missing or `status` ≠ `ssl_active`
 * — the resolver falls back to the default org (Aspire) and silently
 * serves Aspire content on the SoccerOne domain. The middleware uses this
 * to serve a 404 / holding page instead.
 */
export function isUnmappedSoccerOneHost(
  host: string,
  resolvedOrgSlug: string | null | undefined,
): boolean {
  const normalized = normalizeHost(host);
  if (!SOCCERONE_HOSTS.includes(normalized)) return false;
  return resolvedOrgSlug !== SOCCERONE_ORG_SLUG;
}
