/**
 * GET/POST /api/coach/sessions/[id]/glows
 *
 * Glows & Grows — one coach-facing endpoint backing the post-session
 * capture flow (docs/superpowers/specs/2026-07-09-glows-and-grows-design.md).
 *
 * GET returns the bootstrap payload the capture page needs in one round
 * trip: session summary, roster (with same-day practice attendance),
 * the chip sets a coach can pick from, and any glow/grow notes already
 * written for this session (double-entry guard).
 *
 * POST is a whole-batch write: every chip label and familyMemberId is
 * re-validated server-side against the session's legal sets BEFORE any
 * row is written, then all rows for the batch go in one transaction so a
 * bad entry never leaves a partial write behind.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  sessionPlans,
  sessionActivityUsage,
  activities,
  skills,
  teams,
  rosters,
  registrations,
  familyMembers,
  attendance,
  coachNotes,
} from "@/lib/db/schema";
import { eq, and, asc, inArray, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireCoachPortalAccess } from "@/lib/auth";
import { getSessionChips, UNIVERSAL_GLOWS } from "@/lib/curriculum/reinforcement";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Same ownership check as src/pages/api/coach/sessions/[id].ts: the
// session's team must be coached (head or assistant) by this user.
async function verifyCoachAccess(userId: string, sessionId: string) {
  const [session] = await getDb()
    .select({
      id: sessionPlans.id,
      teamId: sessionPlans.teamId,
      coachUserId: teams.coachUserId,
      assistantCoachUserId: teams.assistantCoachUserId,
    })
    .from(sessionPlans)
    .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
    .where(eq(sessionPlans.id, sessionId));

  if (!session) return null;
  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) {
    return null;
  }
  return session;
}

// Resolves the session's segment activities -> skillsDeveloped (skill ids)
// -> skill slugs, then hands them to the pure chip-content module. Shared
// by GET (bootstrap) and POST (server-side chip-label revalidation).
async function resolveSessionChips(sessionId: string) {
  const db = getDb();

  const usageRows = await db
    .select({ activityId: sessionActivityUsage.activityId })
    .from(sessionActivityUsage)
    .where(eq(sessionActivityUsage.sessionPlanId, sessionId));

  const activityIds = [...new Set(usageRows.map((u) => u.activityId))];
  let skillSlugs: string[] = [];

  if (activityIds.length > 0) {
    const activityRows = await db
      .select({ skillsDeveloped: activities.skillsDeveloped })
      .from(activities)
      .where(inArray(activities.id, activityIds));

    const skillIds = [
      ...new Set(activityRows.flatMap((a) => a.skillsDeveloped ?? [])),
    ];

    if (skillIds.length > 0) {
      const skillRows = await db
        .select({ slug: skills.slug })
        .from(skills)
        .where(inArray(skills.id, skillIds))
        .orderBy(asc(skills.slug));
      skillSlugs = skillRows.map((s) => s.slug);
    }
  }

  return getSessionChips({ skillSlugs });
}

// Active roster for the session's team, as (familyMemberId -> roster row)
// needed by both the bootstrap roster list and the POST whole-batch
// membership check.
async function getSessionRoster(teamId: string) {
  return getDb()
    .select({
      rosterId: rosters.id,
      familyMemberId: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(and(eq(rosters.teamId, teamId), eq(rosters.status, "active")))
    .orderBy(asc(familyMembers.lastName), asc(familyMembers.firstName));
}

// GET - bootstrap payload for the capture flow
export const GET: APIRoute = async (context) => {
  try {
    const { params } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) return json({ error: "Access denied" }, 403);

    const db = getDb();

    const [sessionRow] = await db
      .select({
        id: sessionPlans.id,
        title: sessionPlans.title,
        scheduledDate: sessionPlans.scheduledDate,
        status: sessionPlans.status,
        team: { id: teams.id, name: teams.name },
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .where(eq(sessionPlans.id, id));

    if (!sessionRow) return json({ error: "Session not found" }, 404);

    const rosterRows = await getSessionRoster(access.teamId);

    // Same-day practice attendance, mapped by rosterId (attendance rows
    // don't carry familyMemberId directly — see src/pages/api/coach/attendance.ts).
    const dayStart = new Date(sessionRow.scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(sessionRow.scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);

    // gte/lte (not a raw sql`` template with an interpolated Date) —
    // postgres-js's type inference for a bare Date param in an untyped
    // sql fragment picks the wrong wire format under `prepare: false`
    // and throws at bind time. Column-typed operators route the value
    // through the column's mapToDriverValue (Date -> ISO string) first,
    // which is safe. See the same fix in src/pages/api/coach/attendance.ts.
    const attendanceRows = await db
      .select({ rosterId: attendance.rosterId, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.teamId, access.teamId),
          eq(attendance.eventType, "practice"),
          gte(attendance.eventDate, dayStart),
          lte(attendance.eventDate, dayEnd)
        )
      );
    const attendanceByRoster = new Map(attendanceRows.map((r) => [r.rosterId, r.status]));

    const roster = rosterRows.map((r) => ({
      familyMemberId: r.familyMemberId,
      firstName: r.firstName,
      lastName: r.lastName,
      attendanceStatus: attendanceByRoster.get(r.rosterId) ?? null,
    }));

    const chips = await resolveSessionChips(id);

    const existingNotes = await db
      .select({
        id: coachNotes.id,
        familyMemberId: coachNotes.familyMemberId,
        category: coachNotes.category,
        title: coachNotes.title,
        content: coachNotes.content,
        createdAt: coachNotes.createdAt,
      })
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, id))
      .orderBy(asc(coachNotes.createdAt));

    return json(
      {
        session: {
          id: sessionRow.id,
          title: sessionRow.title,
          scheduledDate: sessionRow.scheduledDate,
          status: sessionRow.status,
          team: sessionRow.team,
        },
        roster,
        chips,
        existingNotes,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching glows bootstrap:", error);
    return json({ error: "Internal server error" }, 500);
  }
};

const glowEntrySchema = z
  .object({
    familyMemberId: z.string().uuid(),
    glows: z.array(z.string()).max(3).default([]),
    grow: z.string().optional(),
    note: z.string().max(280).optional(),
  })
  .refine((e) => e.glows.length > 0 || !!e.grow, {
    message: "At least one glow or a grow is required",
    path: ["glows"],
  });

const batchSchema = z.object({
  entries: z.array(glowEntrySchema).min(1).max(40),
});

// POST - batch write, one transaction, whole-batch validation first
export const POST: APIRoute = async (context) => {
  try {
    const { params, request } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) return json({ error: "Access denied" }, 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const validation = batchSchema.safeParse(body);
    if (!validation.success) {
      return json(
        {
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }
    const { entries } = validation.data;

    const chips = await resolveSessionChips(id);
    const legalGlows = new Set(chips.glows);
    const legalGrows = new Set(chips.grows);
    // Skill-specific glows (as opposed to the always-available universal
    // set) drive the achievement-vs-encouragement category split below.
    const skillGlows = new Set(chips.glows.filter((g) => !UNIVERSAL_GLOWS.includes(g)));

    const rosterRows = await getSessionRoster(access.teamId);
    const rosterFamilyMemberIds = new Set(rosterRows.map((r) => r.familyMemberId));

    // Whole-batch validation BEFORE any write: a single bad entry rejects
    // the entire batch with zero rows written.
    for (const entry of entries) {
      if (!rosterFamilyMemberIds.has(entry.familyMemberId)) {
        return json(
          { error: "One or more familyMemberIds are not on this session's roster" },
          400
        );
      }
      for (const glow of entry.glows) {
        if (!legalGlows.has(glow)) {
          return json({ error: `Unknown glow chip: ${glow}` }, 400);
        }
      }
      if (entry.grow && !legalGrows.has(entry.grow)) {
        return json({ error: `Unknown grow chip: ${entry.grow}` }, 400);
      }
    }

    const created = await getDb().transaction(async (tx) => {
      const results: { familyMemberId: string; noteIds: string[] }[] = [];

      for (const entry of entries) {
        const noteIds: string[] = [];

        if (entry.glows.length > 0) {
          const hasSkillGlow = entry.glows.some((g) => skillGlows.has(g));
          const [glowRow] = await tx
            .insert(coachNotes)
            .values({
              familyMemberId: entry.familyMemberId,
              teamId: access.teamId,
              coachUserId: auth.user.id,
              category: hasSkillGlow ? "achievement" : "encouragement",
              title: entry.glows[0],
              content: entry.glows.join(" · ") + (entry.note ? `\n${entry.note}` : ""),
              visibleToParent: true,
              sessionPlanId: id,
            })
            .returning({ id: coachNotes.id });
          noteIds.push(glowRow.id);
        }

        if (entry.grow) {
          const [growRow] = await tx
            .insert(coachNotes)
            .values({
              familyMemberId: entry.familyMemberId,
              teamId: access.teamId,
              coachUserId: auth.user.id,
              category: "focus",
              title: entry.grow,
              content: entry.grow,
              visibleToParent: true,
              sessionPlanId: id,
            })
            .returning({ id: coachNotes.id });
          noteIds.push(growRow.id);
        }

        results.push({ familyMemberId: entry.familyMemberId, noteIds });
      }

      return results;
    });

    return json({ created }, 201);
  } catch (error) {
    console.error("Error writing glows batch:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
