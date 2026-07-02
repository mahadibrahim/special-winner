import type { APIRoute } from "astro";
import { and, eq, gte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, npsResponses, organizations } from "@/lib/db/schema";
import type { OrganizationSettings } from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { npsCategory } from "@/lib/feedback/constants";

export const prerender = false;

const WINDOW_DAYS = 90;
const NPS_KINDS = ["nps_drop_in", "nps_field_rental", "nps_season"] as const;

/** Classic NPS: %promoters − %detractors, rounded, or null with no data. */
function computeNps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => npsCategory(s) === "promoter").length;
  const detractors = scores.filter((s) => npsCategory(s) === "detractor").length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

function weekStartOf(d: Date): string {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCDate(copy.getUTCDate() - copy.getUTCDay());
  return copy.toISOString().slice(0, 10);
}

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Volume is bounded (90-day org window); aggregate in JS for clarity.
  const rows = await db
    .select({
      score: npsResponses.score,
      comment: npsResponses.comment,
      reviewLinkClickedAt: npsResponses.reviewLinkClickedAt,
      respondedAt: feedbackRequests.respondedAt,
      kind: feedbackRequests.kind,
      metadata: feedbackRequests.metadata,
    })
    .from(npsResponses)
    .innerJoin(feedbackRequests, eq(npsResponses.requestId, feedbackRequests.id))
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        inArray(feedbackRequests.kind, [...NPS_KINDS]),
        gte(feedbackRequests.respondedAt, cutoff),
      ),
    )
    .orderBy(desc(feedbackRequests.respondedAt));

  const sentRows = await db
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        inArray(feedbackRequests.kind, [...NPS_KINDS]),
        inArray(feedbackRequests.status, ["sent", "responded"]),
        gte(feedbackRequests.createdAt, cutoff),
      ),
    );

  const scores = rows.map((r) => r.score);
  const byKind = NPS_KINDS.map((kind) => {
    const kindScores = rows.filter((r) => r.kind === kind).map((r) => r.score);
    return { kind, nps: computeNps(kindScores), count: kindScores.length };
  });

  const trendMap = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.respondedAt) continue;
    const week = weekStartOf(r.respondedAt);
    trendMap.set(week, [...(trendMap.get(week) ?? []), r.score]);
  }
  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, s]) => ({ weekStart, nps: computeNps(s), count: s.length }));

  // Detractor comments surface first in the recent feed.
  const recent = [...rows]
    .sort((a, b) => {
      const aDetractor = npsCategory(a.score) === "detractor" ? 0 : 1;
      const bDetractor = npsCategory(b.score) === "detractor" ? 0 : 1;
      return aDetractor - bDetractor;
    })
    .slice(0, 50)
    .map((r) => ({
      score: r.score,
      comment: r.comment,
      kind: r.kind,
      eventLabel: r.metadata?.eventLabel ?? null,
      respondedAt: r.respondedAt?.toISOString() ?? "",
    }));

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgContext.organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  const reviewUrlConfigured = Boolean(
    settings.feedback?.googleReviewUrl?.aspire ||
      settings.feedback?.googleReviewUrl?.soccerone,
  );

  return new Response(
    JSON.stringify({
      nps: computeNps(scores),
      responseCount: rows.length,
      sentCount: sentRows.length,
      responseRate:
        sentRows.length === 0 ? null : Math.round((rows.length / sentRows.length) * 100),
      reviewClicks: rows.filter((r) => r.reviewLinkClickedAt !== null).length,
      reviewUrlConfigured,
      byKind,
      trend,
      recent,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
