/**
 * GET /api/coach/glows/nudge
 *
 * Coach dashboard nudge for Glows & Grows (Plan 2 Task 7,
 * docs/superpowers/specs/2026-07-09-glows-and-grows-design.md §4 "Dashboard
 * nudge"). Lists past sessions (last 14 days) on the coach's teams that are
 * not draft/cancelled and have zero coach_notes rows tied to them yet — the
 * "still owes glows" queue the dashboard card renders as a soft reminder.
 *
 * Unlike the card that consumes it, THIS endpoint does not fail soft: a
 * broken query returns a real 500 so the failure is visible in monitoring.
 * The card is what silently renders nothing on error/loading — see
 * src/components/coach/glows-nudge-card.tsx.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { sessionPlans, teams, rosters, coachNotes } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, inArray, notInArray, count } from "drizzle-orm";
import { requireCoachAccess } from "@/lib/auth";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const LOOKBACK_DAYS = 14;
const MAX_PENDING = 5;

export const GET: APIRoute = async (context) => {
  try {
    const auth = await requireCoachAccess(context);
    if (!auth.authorized) return auth.response;

    if (auth.teamIds.length === 0) {
      return json({ pending: [] }, 200);
    }

    const db = getDb();

    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - LOOKBACK_DAYS);

    // Candidate sessions: past, in-window, on one of the coach's teams, not
    // draft/cancelled. Explicit orderBy per the multi-tenant-query
    // convention (CI's shared DB can have many matches).
    const candidates = await db
      .select({
        id: sessionPlans.id,
        title: sessionPlans.title,
        scheduledDate: sessionPlans.scheduledDate,
        teamId: sessionPlans.teamId,
        teamName: teams.name,
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .where(
        and(
          inArray(sessionPlans.teamId, auth.teamIds),
          gte(sessionPlans.scheduledDate, windowStart),
          lte(sessionPlans.scheduledDate, now),
          notInArray(sessionPlans.status, ["draft", "cancelled"]),
        ),
      )
      .orderBy(desc(sessionPlans.scheduledDate));

    if (candidates.length === 0) {
      return json({ pending: [] }, 200);
    }

    const candidateIds = candidates.map((c) => c.id);

    // Sessions among the candidates that already have at least one
    // coach_notes row tied to them.
    const alreadyGlowedRows = await db
      .selectDistinct({ sessionPlanId: coachNotes.sessionPlanId })
      .from(coachNotes)
      .where(inArray(coachNotes.sessionPlanId, candidateIds));
    const alreadyGlowed = new Set(alreadyGlowedRows.map((r) => r.sessionPlanId));

    const pendingCandidates = candidates
      .filter((c) => !alreadyGlowed.has(c.id))
      .slice(0, MAX_PENDING);

    if (pendingCandidates.length === 0) {
      return json({ pending: [] }, 200);
    }

    // Roster count per team, in one query rather than N.
    const teamIdsNeeded = [...new Set(pendingCandidates.map((c) => c.teamId))];
    const rosterCountRows = await db
      .select({ teamId: rosters.teamId, count: count() })
      .from(rosters)
      .where(and(inArray(rosters.teamId, teamIdsNeeded), eq(rosters.status, "active")))
      .groupBy(rosters.teamId);
    const rosterCountByTeam = new Map(rosterCountRows.map((r) => [r.teamId, r.count]));

    const pending = pendingCandidates.map((c) => ({
      sessionId: c.id,
      title: c.title,
      scheduledDate: c.scheduledDate,
      teamName: c.teamName,
      playerCount: rosterCountByTeam.get(c.teamId) ?? 0,
    }));

    return json({ pending }, 200);
  } catch (error) {
    console.error("Error computing glows nudge:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
