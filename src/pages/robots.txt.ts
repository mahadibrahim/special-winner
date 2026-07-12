// Host-aware robots.txt. Replaces the static public/robots.txt, which was
// baked for the Aspire domain and pointed every other brand's crawlers at
// aspiresportsohio.com's sitemap.
import type { APIRoute } from "astro";
import { robotsTxt } from "@/lib/seo/tenant-seo";

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const origin = `https://${host.split(":")[0].toLowerCase()}`;
  return new Response(robotsTxt(origin), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Cache at the edge per-host; robots content only changes on deploy.
      "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
};
