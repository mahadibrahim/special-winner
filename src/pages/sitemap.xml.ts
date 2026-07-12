// Host-aware sitemap.xml. SoccerOne brand hosts get their own URL set
// (derived from the marketing rewrite map); Aspire hosts redirect to the
// @astrojs/sitemap output (/sitemap-index.xml), which is built with the
// Aspire PUBLIC_APP_URL as `site` and stays the complete Aspire map.
// Replaces the stale static public/sitemap.xml (hand-written 2026-04-26,
// Aspire URLs only, served identically on every brand domain).
import type { APIRoute } from "astro";
import { isSoccerOneHost } from "@/lib/organization/soccerone-routing";
import { soccerOneSitemapXml } from "@/lib/seo/tenant-seo";

export const prerender = false;

export const GET: APIRoute = ({ request, redirect }) => {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (!isSoccerOneHost(host)) {
    return redirect("/sitemap-index.xml", 301);
  }
  const origin = `https://${host.split(":")[0].toLowerCase()}`;
  return new Response(soccerOneSitemapXml(origin), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
};
