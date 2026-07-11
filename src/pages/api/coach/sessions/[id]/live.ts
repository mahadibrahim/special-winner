/**
 * GET /api/coach/sessions/[id]/live
 *
 * The one composite payload behind the live-session island (coach session
 * lifecycle spec). Everything setup/field-mode/wrap-up needs, in one round
 * trip — the client holds it in memory for the whole session (load-once
 * resilience; fields have bad signal).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  sessionPlans, activities, teams, seasons, programs,
  rosters, registrations, familyMembers, attendance, users,
} from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import { coachPrompts } from "@/lib/db/schema/coach-guidance";
import { sequenceAttachments } from "@/lib/db/schema/blueprint";
import { eq, and, or, asc, desc, inArray, isNull, gte, lte } from "drizzle-orm";
import { requireCoachPortalAccess } from "@/lib/auth";
import { getSessionChips } from "@/lib/curriculum/reinforcement";
import { groupNoun } from "@/lib/programs/group-noun";
import { deriveEquipment } from "@/lib/sessions/equipment";
import { orderPromptPool } from "@/lib/sessions/prompt-pool";
import { resolveSessionChipSkillSlugs } from "@/lib/sessions/session-chips";
import type { LivePrompt, LiveSegment } from "@/lib/sessions/types";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Same ownership check as the sibling session endpoints.
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
  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) return null;
  return session;
}

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

    const [row] = await db
      .select({
        id: sessionPlans.id,
        title: sessionPlans.title,
        status: sessionPlans.status,
        startedAt: sessionPlans.startedAt,
        scheduledDate: sessionPlans.scheduledDate,
        durationMinutes: sessionPlans.durationMinutes,
        segments: sessionPlans.segments,
        objectives: sessionPlans.objectives,
        focusSkillIds: sessionPlans.focusSkillIds,
        equipmentNeeded: sessionPlans.equipmentNeeded,
        preSessionNotes: sessionPlans.preSessionNotes,
        sequenceAttachmentId: sessionPlans.sequenceAttachmentId,
        teamName: teams.name,
        programType: programs.programType,
        sportId: programs.sportId,
        distributorFirstName: users.firstName,
        distributorEmail: users.email,
      })
      .from(sessionPlans)
      .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .leftJoin(sequenceAttachments, eq(sessionPlans.sequenceAttachmentId, sequenceAttachments.id))
      .leftJoin(users, eq(sequenceAttachments.distributedBy, users.id))
      .where(eq(sessionPlans.id, id));

    if (!row) return json({ error: "Session not found" }, 404);

    // Resolve each segment's activity -> skill ids + equipment in one query.
    const segs = row.segments ?? [];
    const activityIds = [...new Set(segs.map((s) => s.activityId).filter((a): a is string => !!a))];
    const activityRows = activityIds.length
      ? await db
          .select({
            id: activities.id,
            skillsDeveloped: activities.skillsDeveloped,
            equipmentNeeded: activities.equipmentNeeded,
          })
          .from(activities)
          .where(inArray(activities.id, activityIds))
      : [];
    const activityById = new Map(activityRows.map((a) => [a.id, a]));

    const segments: LiveSegment[] = segs.map((s) => ({
      order: s.order,
      name: s.name,
      type: s.type,
      durationMinutes: s.durationMinutes,
      activityId: s.activityId,
      activityName: s.activityName,
      notes: s.notes,
      activitySkillIds: s.activityId
        ? (activityById.get(s.activityId)?.skillsDeveloped ?? [])
        : [],
    }));

    const equipment = deriveEquipment(
      row.equipmentNeeded,
      segs.map((s) => (s.activityId ? (activityById.get(s.activityId)?.equipmentNeeded ?? null) : null)),
    );

    // Prompt pool: during_practice prompts for this sport (or sport-agnostic),
    // org-or-global, matching the plan's skills or generic (skillId null).
    const planSkillIds = [
      ...new Set([...(row.focusSkillIds ?? []), ...segments.flatMap((s) => s.activitySkillIds)]),
    ];
    const promptRows = await db
      .select({
        id: coachPrompts.id,
        promptType: coachPrompts.promptType,
        content: coachPrompts.content,
        skillId: coachPrompts.skillId,
        priority: coachPrompts.priority,
      })
      .from(coachPrompts)
      .where(
        and(
          eq(coachPrompts.active, true),
          eq(coachPrompts.triggerContext, "during_practice"),
          or(isNull(coachPrompts.organizationId), eq(coachPrompts.organizationId, auth.organizationId)),
          or(isNull(coachPrompts.sportId), eq(coachPrompts.sportId, row.sportId)),
          planSkillIds.length > 0
            ? or(isNull(coachPrompts.skillId), inArray(coachPrompts.skillId, planSkillIds))
            : isNull(coachPrompts.skillId),
        ),
      )
      .orderBy(desc(coachPrompts.priority), asc(coachPrompts.id));
    const prompts: LivePrompt[] = promptRows.map((p) => ({
      id: p.id,
      promptType: p.promptType,
      content: p.content,
      skillId: p.skillId,
      priority: p.priority,
    }));
    const orderedPrompts = orderPromptPool(prompts);

    // Roster with any same-day practice attendance already recorded.
    const rosterRows = await db
      .select({
        rosterId: rosters.id,
        familyMemberId: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(and(eq(rosters.teamId, access.teamId), eq(rosters.status, "active")))
      .orderBy(asc(familyMembers.lastName), asc(familyMembers.firstName));

    const dayStart = new Date(row.scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(row.scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);
    const attendanceRows = await db
      .select({ rosterId: attendance.rosterId, status: attendance.status })
      .from(attendance)
      .where(
        and(
          eq(attendance.teamId, access.teamId),
          eq(attendance.eventType, "practice"),
          gte(attendance.eventDate, dayStart),
          lte(attendance.eventDate, dayEnd),
        ),
      );
    const attendanceByRoster = new Map(attendanceRows.map((r) => [r.rosterId, r.status]));

    // Glow/grow chips for the wrap-up seed — resolved via the shared
    // helper (session-chips.ts), NOT planSkillIds, so this can never drift
    // from the glows POST's legal chip set (Fix 1: the helper additionally
    // unions sessionActivityUsage rows, the source the glows POST
    // validates against, which planSkillIds above doesn't include).
    const glowChips = getSessionChips({ skillSlugs: await resolveSessionChipSkillSlugs(id) });

    const captureRows = await db
      .select({
        id: sessionCaptures.id,
        clientId: sessionCaptures.clientId,
        rosterId: sessionCaptures.rosterId,
        kind: sessionCaptures.kind,
        skillId: sessionCaptures.skillId,
        note: sessionCaptures.note,
        consumedAt: sessionCaptures.consumedAt,
      })
      .from(sessionCaptures)
      .where(eq(sessionCaptures.sessionPlanId, id))
      .orderBy(asc(sessionCaptures.createdAt));

    return json(
      {
        session: {
          id: row.id,
          title: row.title,
          status: row.status,
          startedAt: row.startedAt,
          scheduledDate: row.scheduledDate,
          durationMinutes: row.durationMinutes,
          objectives: row.objectives ?? [],
          focusSkillIds: row.focusSkillIds ?? [],
          preSessionNotes: row.preSessionNotes,
          prescribed: row.sequenceAttachmentId
            ? {
                attachmentId: row.sequenceAttachmentId,
                distributorFirstName:
                  row.distributorFirstName || row.distributorEmail?.split("@")[0] || null,
              }
            : null,
          groupNoun: groupNoun(row.programType),
          teamName: row.teamName,
        },
        segments,
        equipment,
        prompts: orderedPrompts,
        roster: rosterRows.map((r) => ({
          ...r,
          attendanceStatus: attendanceByRoster.get(r.rosterId) ?? null,
        })),
        glowChips,
        captures: captureRows,
      },
      200,
    );
  } catch (error) {
    console.error("Error building live session payload:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
