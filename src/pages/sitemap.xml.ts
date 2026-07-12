// Host-aware sitemap.xml. SoccerOne brand hosts get their own URL set
// (derived from the marketing rewrite map); Aspire hosts redirect to the
// @astrojs/sitemap output (/sitemap-index.xml), which is built with the
// Aspire PUBLIC_APP_URL as `site` and stays the complete Aspire map.
// Replaces the stale static public/sitemap.xml (hand-written 2026-04-26,
// Aspire URLs only, served identically on every brand domain).
import type { APIRoute } from "astro";
import { isSoccerOneHost } from "@/lib/organization/soccerone-routing";
import { aspireSitemapXml, soccerOneSitemapXml } from "@/lib/seo/tenant-seo";

export const prerender = false;

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export const GET: APIRoute = ({ request, redirect }) => {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const origin = `https://${host.split(":")[0].toLowerCase()}`;
  if (!isSoccerOneHost(host)) {
    // Production: the @astrojs/sitemap build output is the complete Aspire
    // map (prerendered pages + the shared SSR list). Dev/CI has no build
    // artifacts, so serve the SSR list inline instead of 301ing into a 404.
    if (import.meta.env.PROD) {
      return redirect("/sitemap-index.xml", 301);
    }
    return new Response(aspireSitemapXml(origin), { headers: XML_HEADERS });
  }
  return new Response(soccerOneSitemapXml(origin), { headers: XML_HEADERS });
};
