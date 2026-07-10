/**
 * GET /api/coach/program-plan/nudge
 *
 * Coach dashboard notification for Program Blueprint distribution (Task 5,
 * "Distribution" § "Coach notification" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md):
 *
 *   "one in-app notification per affected coach — 'Your {season name}
 *   {class|camp group|team} schedule is ready — N sessions,' landing as a
 *   dashboard card via the existing nudge-card pattern (fail-soft card,
 *   real endpoint)."
 *
 * Lists sequence_attachments distributed in the last 7 days that produced
 * at least one session_plans row on one of the coach's own teams, grouped
 * by attachment. `sessionCount` counts only the caller's own team(s) under
 * that attachment — a single distribution run can span many teams across
 * many coaches (see attach.ts), and this endpoint must never leak another
 * coach's session count or team name into the caller's card.
 *
 * Unlike the CARD that consumes it (src/components/coach/program-plan-card.tsx,
 * which fails soft), this endpoint does not fail soft: a broken query
 * returns a real 500 so the failure is visible in monitoring. Mirrors
 * src/pages/api/coach/glows/nudge.ts.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { sessionPlans, teams, seasons, programs, users } from "@/lib/db/schema";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, and, gte, inArray, asc } from "drizzle-orm";
import { requireCoachAccess } from "@/lib/auth";
import { groupNoun } from "@/lib/programs/group-noun";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const LOOKBACK_DAYS = 7;
const MAX_PENDING = 5;

export const GET: APIRoute = async (context) => {
  try {
    const auth = await requireCoachAccess(context);
    if (!auth.authorized) return auth.response;

    if (auth.teamIds.length === 0) {
      return json({ pending: [] }, 200);
    }

    const db = getDb();

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - LOOKBACK_DAYS);

    // Every prescribed session on one of MY teams whose attachment was
    // distributed within the lookback window. Explicit orderBy per the
    // multi-tenant-query convention — used below both to make row
    // processing deterministic and to derive each group's earliestDate.
    const rows = await db
      .select({
        attachmentId: sequenceAttachments.id,
        distributedAt: sequenceAttachments.distributedAt,
        teamName: teams.name,
        scheduledDate: sessionPlans.scheduledDate,
        seasonName: seasons.name,
        programType: programs.programType,
        distributorFirstName: users.firstName,
        distributorEmail: users.email,
      })
      .from(sessionPlans)
      .innerJoin(
        sequenceAttachments,
        eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id),
      )
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(users, eq(sequenceAttachments.distributedBy, users.id))
      .where(
        and(
          inArray(sessionPlans.teamId, auth.teamIds),
          gte(sequenceAttachments.distributedAt, windowStart),
        ),
      )
      .orderBy(asc(sessionPlans.scheduledDate));

    if (rows.length === 0) {
      return json({ pending: [] }, 200);
    }

    type Group = {
      attachmentId: string;
      distributedAt: Date;
      seasonName: string;
      groupLabel: string;
      noun: string;
      sessionCount: number;
      earliestDate: Date;
      distributorFirstName: string;
    };

    const groups = new Map<string, Group>();
    for (const row of rows) {
      const existing = groups.get(row.attachmentId);
      if (existing) {
        existing.sessionCount += 1;
        if (row.scheduledDate < existing.earliestDate) {
          existing.earliestDate = row.scheduledDate;
        }
        continue;
      }

      groups.set(row.attachmentId, {
        attachmentId: row.attachmentId,
        distributedAt: row.distributedAt,
        seasonName: row.seasonName,
        // "my team's name" — rows are grouped by attachment, so if the
        // caller coaches more than one team under the same attachment the
        // first (earliest-scheduled) team's name wins; sessionCount below
        // still totals across all of the caller's teams for this attachment.
        groupLabel: row.teamName,
        noun: groupNoun(row.programType),
        sessionCount: 1,
        earliestDate: row.scheduledDate,
        distributorFirstName:
          row.distributorFirstName || row.distributorEmail.split("@")[0],
      });
    }

    const pending = [...groups.values()]
      .sort((a, b) => b.distributedAt.getTime() - a.distributedAt.getTime())
      .slice(0, MAX_PENDING)
      .map(({ distributedAt: _distributedAt, ...rest }) => rest);

    return json({ pending }, 200);
  } catch (error) {
    console.error("Error computing program-plan nudge:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
