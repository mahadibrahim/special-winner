// Aspire's public SSR marketing pages — single source of truth shared by
// astro.config.mjs (feeds @astrojs/sitemap's customPages at build time) and
// src/pages/sitemap.xml.ts (serves the dev/CI fallback sitemap at runtime).
// Plain .mjs so the Astro config can import it without a TS loader.
// Dynamic slugs (/sports/[slug], /locations/[slug]) are intentionally
// omitted: DB-driven, crawlable via the listed index pages.
export const ASPIRE_SSR_PUBLIC_PAGES = [
  "/",
  "/youth",
  // Sport landing pages — registry-driven (src/lib/youth/sport-pages.ts);
  // keep in sync when a sport launches.
  "/youth/soccer",
  "/youth/futsal",
  "/youth/leagues",
  "/youth/classes",
  "/youth/camps",
  "/youth/philosophy",
  "/adult",
  "/adult-soccer-leagues-columbus",
  "/adult-flag-football-columbus",
  // Suburb pages — keep in sync with SUBURB_PAGES in src/lib/seo/suburb-pages.ts
  "/adult-soccer-leagues-dublin",
  "/adult-soccer-leagues-westerville",
  "/adult-soccer-leagues-powell",
  "/adult-soccer-leagues-hilliard",
  "/adult-soccer-leagues-gahanna",
  "/adult-soccer-leagues-clintonville",
  "/adult-soccer-leagues-upper-arlington",
  "/adult-soccer-leagues-new-albany",
  "/adult-soccer-leagues-downtown-columbus",
  "/adult/leagues",
  "/adult/leagues/soccer",
  "/adult/leagues/flag-football",
  "/adult/pickup",
  "/adult/tournaments",
  "/locations",
  "/sports",
];
