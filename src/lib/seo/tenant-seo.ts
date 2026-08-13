// Per-tenant robots.txt + sitemap.xml generation.
//
// Why this exists: the site is one build serving multiple brand domains
// (aspiresportsohio.com, gosoccerone.com, ...). The old static
// public/robots.txt and public/sitemap.xml were baked for the Aspire domain
// only — so gosoccerone.com told crawlers its sitemap lived on
// aspiresportsohio.com and listed zero of its own URLs. Result: nothing on
// gosoccerone.com was indexed (site:gosoccerone.com came back empty).
//
// These pure generators are host-aware. The SoccerOne URL set derives from
// SOCCERONE_MARKETING_REWRITES — the single source of truth for which
// marketing paths exist on SoccerOne hosts — so a new page added to the
// rewrite map lands in the sitemap automatically.

import { SOCCERONE_MARKETING_REWRITES } from "@/lib/organization/soccerone-routing";
// Plain .mjs module shared with astro.config.mjs (single source of truth).
import { ASPIRE_SSR_PUBLIC_PAGES } from "@/lib/seo/aspire-sitemap-pages.mjs";

/**
 * Path prefixes crawlers should skip on every brand (auth/portal/API).
 * Keep in sync with PRIVATE_PREFIXES in astro.config.mjs — that list controls
 * what enters the sitemap, this one controls what crawlers fetch. A route
 * missing from either leaks: /portal, /staff and /referee were in the sitemap
 * and crawlable while 302-ing straight to /signin.
 */
const DISALLOW = [
  "/admin/",
  "/coach/",
  "/dashboard/",
  "/account/",
  "/messages/",
  "/media/",
  "/api/",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password/",
  "/payment",
  "/verify-email",
  "/m/",
  "/auth/",
  "/portal",
  "/staff/",
  "/host/",
  "/referee/",
  "/drop-league/dashboard",
  "/register/",
  "/team/",
  "/feedback/",
  "/email-link-signin",
  "/dropin/claim/",
  "/rentals/claim/",
] as const;

// Deliberately NOT disallowed here: /shop/checkout, /shop/order and
// /consent/confirmed. Those are reachable from order and email links, and a
// robots.txt block would stop Google fetching them — which means it never
// sees their `noindex` and can still list a bare URL with no snippet. They
// carry <meta name="robots" content="noindex"> instead (BaseLayout `noindex`),
// which is the stronger signal, and they stay out of the sitemap via
// PRIVATE_PREFIXES in astro.config.mjs.

export function robotsTxt(origin: string): string {
  const lines = [
    "User-agent: *",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    // Term pages (/leagues/{term}, /adult/leagues/soccer/{term}) are
    // DB-driven and can't live in the static lists above or the build-time
    // @astrojs/sitemap output — they get their own dynamic sitemap.
    `Sitemap: ${origin}/sitemap-leagues.xml`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Sitemap for SoccerOne brand hosts: every marketing path in the rewrite
 * map, absolute against the requesting origin. `lastmod` is deliberately
 * omitted — a wrong/stale lastmod is worse than none.
 */
export function soccerOneSitemapXml(origin: string): string {
  return sitemapXml(origin, Object.keys(SOCCERONE_MARKETING_REWRITES));
}

/**
 * Dev/CI fallback sitemap for Aspire hosts, built from the same page list
 * astro.config.mjs feeds @astrojs/sitemap. In production Aspire hosts are
 * 301-redirected to the complete built /sitemap-index.xml instead — this
 * exists because that build artifact doesn't exist on the dev server.
 */
export function aspireSitemapXml(origin: string): string {
  return sitemapXml(origin, ASPIRE_SSR_PUBLIC_PAGES as string[]);
}

function sitemapXml(origin: string, paths: string[]): string {
  const urls = paths
    .map((p) => `  <url>\n    <loc>${origin}${p === "/" ? "/" : p}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
