import type { APIRoute } from "astro";
import { and, eq, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, refereeRatings, users } from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

const WINDOW_DAYS = 180;
/** Below this rating count, averages get a low-sample badge in the UI. */
const LOW_SAMPLE_THRESHOLD = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Join through feedback_requests ONLY for org scoping + game metadata —
  // recipientUserId (the rater) is deliberately never selected.
  const rows = await db
    .select({
      refereeUserId: refereeRatings.refereeUserId,
      refFirstName: users.firstName,
      refLastName: users.lastName,
      overall: refereeRatings.overall,
      gameControl: refereeRatings.gameControl,
      communication: refereeRatings.communication,
      fairness: refereeRatings.fairness,
      comment: refereeRatings.comment,
      createdAt: refereeRatings.createdAt,
      metadata: feedbackRequests.metadata,
    })
    .from(refereeRatings)
    .innerJoin(feedbackRequests, eq(refereeRatings.requestId, feedbackRequests.id))
    .innerJoin(users, eq(refereeRatings.refereeUserId, users.id))
    .where(
      and(
        eq(feedbackRequests.organizationId, orgContext.organizationId),
        gte(refereeRatings.createdAt, cutoff),
      ),
    )
    .orderBy(desc(refereeRatings.createdAt));

  const byReferee = new Map<string, typeof rows>();
  for (const row of rows) {
    byReferee.set(row.refereeUserId, [...(byReferee.get(row.refereeUserId) ?? []), row]);
  }

  const referees = [...byReferee.entries()]
    .map(([refereeUserId, ratings]) => {
      const avg = (pick: (r: (typeof ratings)[number]) => number) =>
        ratings.length === 0
          ? 0
          : round1(ratings.reduce((sum, r) => sum + pick(r), 0) / ratings.length);
      return {
        refereeUserId,
        name: `${ratings[0].refFirstName ?? ""} ${ratings[0].refLastName ?? ""}`.trim(),
        count: ratings.length,
        avgOverall: avg((r) => r.overall),
        avgGameControl: avg((r) => r.gameControl),
        avgCommunication: avg((r) => r.communication),
        avgFairness: avg((r) => r.fairness),
        leagueCount: ratings.filter((r) => r.metadata?.gameType === "league").length,
        tournamentCount: ratings.filter((r) => r.metadata?.gameType === "tournament").length,
        lowSample: ratings.length < LOW_SAMPLE_THRESHOLD,
      };
    })
    .sort((a, b) => b.count - a.count);

  const recentComments = rows
    .filter((r) => r.comment !== null)
    .slice(0, 50)
    .map((r) => ({
      comment: r.comment as string,
      overall: r.overall,
      gameType: r.metadata?.gameType ?? null,
      eventLabel: r.metadata?.eventLabel ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

  return new Response(JSON.stringify({ referees, recentComments }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
