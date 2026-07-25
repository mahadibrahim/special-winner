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
  "/join": "/soccerone/join",
  "/sponsors": "/soccerone/sponsors",
  "/careers": "/soccerone/careers",
} as const;

/**
 * The season tier (`/leagues/<term>`) — the one dynamic route on a SoccerOne
 * host.
 *
 * Everything else in this module is exact-match: `SOCCERONE_MARKETING_REWRITES`
 * is a fixed table and its inverse is *derived* from it, so the two directions
 * cannot drift. Term slugs are generated per season (`fall-2026`,
 * `winter-1-2627`, …), so they cannot live in that table without a code change
 * and a deploy for every season we ever run.
 *
 * The trade: this rule is hand-written in BOTH directions
 * (`rewriteSoccerOnePath` / `getSoccerOneCanonicalRedirect`), so nothing
 * structural keeps them symmetric. The round-trip test in
 * tests/unit/organization/soccerone-routing.test.ts is what enforces it —
 * short → long → short must be the identity, or a visitor ping-pongs between
 * the rewrite and the canonical redirect.
 *
 * Exactly ONE path segment is dynamic, and only under /leagues. A term slug is
 * lowercase alphanumeric with single dashes between parts. This deliberately
 * rejects empty segments, nested paths, uppercase, dots (file extensions) and
 * `..` traversal — all of which must fall through to a 404 rather than rewrite.
 */
const TERM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHORT_LEAGUES_PREFIX = "/leagues/";
const LONG_LEAGUES_PREFIX = "/soccerone/leagues/";

/**
 * If `pathname` is `<prefix><term-slug>` with exactly one valid slug segment,
 * return the slug. Otherwise null.
 */
function leagueTermSlug(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return TERM_SLUG.test(rest) ? rest : null;
}

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
  const exact = SOCCERONE_MARKETING_REWRITES[pathname];
  if (exact) return exact;

  // Season tier — the sole dynamic route. See TERM_SLUG above.
  const term = leagueTermSlug(pathname, SHORT_LEAGUES_PREFIX);
  return term ? `${LONG_LEAGUES_PREFIX}${term}` : null;
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
 * Inverse of SOCCERONE_MARKETING_REWRITES: long-form `/soccerone/*` path →
 * its short public path. Built from the rewrite table so the two can never
 * drift apart.
 */
const SOCCERONE_LONG_TO_SHORT: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(SOCCERONE_MARKETING_REWRITES).map(([short, long]) => [
      long,
      short,
    ]),
  );

/**
 * If the pathname is a long-form SoccerOne page path (`/soccerone`,
 * `/soccerone/leagues`, …), return the short public path it should 301 to
 * (`/`, `/leagues`, …). Otherwise null.
 *
 * The public URL on a SoccerOne host is the short form; the `/soccerone/*`
 * files exist only as the rewrite *target*. A SoccerOne host that receives a
 * long-form URL (old bookmark, stale inbound link) redirects to the canonical
 * short form — the exact inverse of `rewriteSoccerOnePath`.
 *
 * This only ever maps long → short (the table has no entry whose key equals
 * its value), so it can never redirect a path to itself.
 *
 * Caller responsibility: gate on `isSoccerOneHost(host)`, and run this BEFORE
 * the short-form rewrite. Since the rewrite uses `next()` (no middleware
 * re-run), the internal `/leagues` → `/soccerone/leagues` rewrite never
 * re-enters this check, so there is no redirect↔rewrite loop.
 */
export function getSoccerOneCanonicalRedirect(pathname: string): string | null {
  const short = SOCCERONE_LONG_TO_SHORT[pathname];
  if (short) return short;

  // Season tier — the exact inverse of the dynamic rule in
  // rewriteSoccerOnePath. Kept symmetric by the round-trip unit test.
  const term = leagueTermSlug(pathname, LONG_LEAGUES_PREFIX);
  return term ? `${SHORT_LEAGUES_PREFIX}${term}` : null;
}

// NOTE: the Phase-1 `isUnmappedSoccerOneHost` 404-guard is gone. It existed
// to stop a SoccerOne host from silently serving Aspire content when the
// SoccerOne org's domain mapping was missing — under the single-org model,
// Aspire content on a SoccerOne host IS the design (same inventory, brand
// skin applied by host), so there is no wrong-content state left to guard.
