import type { APIRoute } from "astro";
import { and, eq, inArray, isNull, isNotNull, gt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { getCoachTeamIds } from "@/lib/auth/roles";
import { getAssessmentsDueCount } from "@/lib/curriculum/assessment-cadence-query";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Sidebar badge counts for the coach portal: unread team-scoped inbox +
// players with a due/overdue/never assessment (Phase 4 cadence). Fail-soft:
// any error returns zeros so the sidebar never breaks on a badge fetch.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  try {
    const teamIds = await getCoachTeamIds(locals.user.id);
    if (teamIds.length === 0) return json({ inbox: 0, assessmentsDue: 0 });

    const db = getDb();
    const assessmentsDue = await getAssessmentsDueCount(db, teamIds, new Date());

    const parents = await db
      .selectDistinct({ parentUserId: familyMembers.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
      .where(inArray(rosters.teamId, teamIds));
    const parentIds = parents.map((p) => p.parentUserId).filter((x): x is string => !!x);
    if (parentIds.length === 0) return json({ inbox: 0, assessmentsDue });

    const unread = and(
      isNotNull(conversations.lastInboundAt),
      or(
        isNull(conversations.lastOutboundAt),
        gt(conversations.lastInboundAt, conversations.lastOutboundAt),
      ),
    );
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(inArray(conversations.parentUserId, parentIds), unread));
    return json({ inbox: row?.count ?? 0, assessmentsDue });
  } catch {
    return json({ inbox: 0, assessmentsDue: 0 });
  }
};
