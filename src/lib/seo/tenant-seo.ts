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

/** Path prefixes crawlers should skip on every brand (auth/portal/API). */
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
] as const;

export function robotsTxt(origin: string): string {
  const lines = [
    "User-agent: *",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
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
  const paths = Object.keys(SOCCERONE_MARKETING_REWRITES);
  const urls = paths
    .map((p) => `  <url>\n    <loc>${origin}${p === "/" ? "/" : p}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
