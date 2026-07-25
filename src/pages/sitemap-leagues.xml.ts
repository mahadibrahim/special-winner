// Dynamic sitemap for the league TERM pages — the only DB-driven public URLs.
// The static sitemaps can't carry them: SoccerOne's is built from the fixed
// rewrite map, and Aspire's prod sitemap is a build-time artifact (no
// DATABASE_URL in the Netlify build env). Referenced from robots.txt on both
// hosts alongside the main sitemap.
//
// Completed terms are included on purpose: archive pages are permanent
// (final standings & results) — that permanence is the point of the
// completed-term fix.
import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, organizations } from "@/lib/db/schema";
import { and, eq, sql, isNotNull, inArray } from "drizzle-orm";
import { isSoccerOneHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export const GET: APIRoute = async ({ request, locals }) => {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const origin = `https://${host.split(":")[0].toLowerCase()}`;
  const organization = locals.organization;

  let terms: string[] = [];
  if (db && organization) {
    const rows = await db
      .selectDistinct({ termSlug: seasons.termSlug })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .where(
        and(
          eq(organizations.id, organization.id),
          eq(organizations.status, "active"),
          eq(seasons.isTest, false),
          eq(programs.isTest, false),
          isNotNull(seasons.termSlug),
          // Public statuses only — never leak draft terms (unannounced
          // pricing/dates), mirroring /api/public/seasons.
          inArray(seasons.status, ["open", "active", "forming", "completed"]),
        ),
      )
      .orderBy(sql`1`);
    terms = rows.map((r) => r.termSlug).filter((t): t is string => !!t);
  }

  // Same terms, per-brand URL space. (Aspire's term page is adult-soccer
  // scoped; a hypothetical youth-only term would redirect there — acceptable,
  // every real term to date carries adult divisions.)
  const prefix = isSoccerOneHost(host) ? "/leagues/" : "/adult/leagues/soccer/";
  const urls = terms
    .map((t) => `  <url>\n    <loc>${origin}${prefix}${t}</loc>\n  </url>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: XML_HEADERS });
};
