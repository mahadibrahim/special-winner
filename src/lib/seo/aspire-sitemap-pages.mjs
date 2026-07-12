// Aspire's public SSR marketing pages — single source of truth shared by
// astro.config.mjs (feeds @astrojs/sitemap's customPages at build time) and
// src/pages/sitemap.xml.ts (serves the dev/CI fallback sitemap at runtime).
// Plain .mjs so the Astro config can import it without a TS loader.
// Dynamic slugs (/sports/[slug], /locations/[slug]) are intentionally
// omitted: DB-driven, crawlable via the listed index pages.
export const ASPIRE_SSR_PUBLIC_PAGES = [
  "/",
  "/youth",
  "/youth/leagues",
  "/youth/camps",
  "/adult",
  "/adult/leagues",
  "/adult/pickup",
  "/adult/tournaments",
  "/locations",
  "/sports",
];
