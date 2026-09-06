/**
 * Unified "my groups" resolver for the coach portal (Task 2 of the
 * 2026-09-05-coach-classes-phase01 plan): everything a coach is staffed on,
 * across the two coaching models that coexist per the scoping spec
 * (docs/superpowers/specs/2026-09-05-coach-activity-pipeline-scoping.md §6) —
 * legacy team coaching (teams.coachUserId / assistantCoachUserId) and the new
 * polymorphic `coaching_assignments` table for classes.
 *
 * Batched, not per-group: this issues a small fixed number of queries
 * regardless of how many templates/sessions the coach is staffed on.
 */
import { and, eq, gte, inArray, lt, ne, or, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getCoachTeamIds } from "@/lib/auth/roles";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { teams, venues } from "@/lib/db/schema/teams";

export interface CoachClassGroup {
  templateId: string;
  name: string;
  weekday: number;
  startTime: string;
  role: "lead" | "assistant";
  /** true = the coach has no standing `class_template` assignment for this
   *  template — they only hold `class_session` assignment(s) materialized
   *  onto specific upcoming sessions (a one-off substitute), not an
   *  ongoing staffing of the recurring slot. */
  sessionOnly: boolean;
}

/** An upcoming camp day-session the coach is staffed on (Camps Phase 4
 *  Task 6) — either via an active `class_session` assignment on the
 *  day-session itself (the materializer-staffed path) or as a
 *  lead/assistant pod coach of a team under the session's camp season. */
export interface CoachCampSession {
  sessionId: string;
  /** Human label from the session's own display columns
   *  (`sportOrClassLabel` + `formatLabel`) — never raw ids. */
  label: string;
  startsAt: Date;
  venueName: string;
}

/** How far ahead the "Camp days" list looks. */
const CAMP_SESSION_HORIZON_MS = 7 * 86_400_000;

export async function getCoachGroups(
  userId: string,
  organizationId: string,
): Promise<{
  teamIds: string[];
  classGroups: CoachClassGroup[];
  campSessions: CoachCampSession[];
}> {
  const db = getDb();

  const [teamIds, templateAssignments, sessionAssignments] = await Promise.all([
    getCoachTeamIds(userId),
    db
      .select({
        targetId: coachingAssignments.targetId,
        role: coachingAssignments.role,
      })
      .from(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.organizationId, organizationId),
          eq(coachingAssignments.coachUserId, userId),
          eq(coachingAssignments.kind, "class_template"),
          eq(coachingAssignments.active, true),
        ),
      ),
    db
      .select({
        targetId: coachingAssignments.targetId,
        role: coachingAssignments.role,
      })
      .from(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.organizationId, organizationId),
          eq(coachingAssignments.coachUserId, userId),
          eq(coachingAssignments.kind, "class_session"),
          eq(coachingAssignments.active, true),
        ),
      ),
  ]);

  // Resolve each class_session assignment's target (a drop_in_sessions row)
  // back to the template it was materialized from, one batched lookup.
  const sessionIds = sessionAssignments.map((a) => a.targetId);
  const sessionRows = sessionIds.length
    ? await db
        .select({
          id: dropInSessions.id,
          classSlotTemplateId: dropInSessions.classSlotTemplateId,
        })
        .from(dropInSessions)
        .where(inArray(dropInSessions.id, sessionIds))
    : [];
  const templateIdBySessionId = new Map(
    sessionRows.map((row) => [row.id, row.classSlotTemplateId]),
  );

  // Template-level assignments are the canonical, non-substitute staffing —
  // seed the group map from those first.
  const groupByTemplateId = new Map<string, { role: "lead" | "assistant"; sessionOnly: boolean }>();
  for (const assignment of templateAssignments) {
    groupByTemplateId.set(assignment.targetId, {
      role: assignment.role,
      sessionOnly: false,
    });
  }
  // Session-only assignments add a group ONLY when the coach has no
  // template-level assignment already covering it — a substitute on one
  // session of a template someone else leads is `sessionOnly: true`; a lead
  // who also happens to hold a session assignment (e.g. materialized copy)
  // is not re-flagged as a substitute of their own template.
  for (const assignment of sessionAssignments) {
    const templateId = templateIdBySessionId.get(assignment.targetId);
    if (!templateId) continue; // one-off session with no template — no group to surface here
    if (!groupByTemplateId.has(templateId)) {
      groupByTemplateId.set(templateId, { role: assignment.role, sessionOnly: true });
    }
  }

  const templateIds = Array.from(groupByTemplateId.keys());
  const templates = templateIds.length
    ? await db
        .select({
          id: classSlotTemplates.id,
          name: classSlotTemplates.name,
          weekday: classSlotTemplates.weekday,
          startTime: classSlotTemplates.startTime,
        })
        .from(classSlotTemplates)
        .where(
          and(
            inArray(classSlotTemplates.id, templateIds),
            eq(classSlotTemplates.organizationId, organizationId),
          ),
        )
    : [];

  const classGroups: CoachClassGroup[] = templates.map((template) => {
    const group = groupByTemplateId.get(template.id)!;
    return {
      templateId: template.id,
      name: template.name,
      weekday: template.weekday,
      startTime: template.startTime,
      role: group.role,
      sessionOnly: group.sessionOnly,
    };
  });

  // ---- Camp days (Camps Phase 4 Task 6) -------------------------------
  // Upcoming (next 7 days) kind='camp' day-sessions this coach reaches,
  // via either staffing model. Both probes are pinned to
  // dropInSessions.organizationId (defense-in-depth: assignment/team rows
  // can't pull in another org's session).
  const now = new Date();
  const horizon = new Date(now.getTime() + CAMP_SESSION_HORIZON_MS);
  const campSessionWindow = and(
    eq(dropInSessions.organizationId, organizationId),
    eq(dropInSessions.kind, "camp"),
    ne(dropInSessions.status, "cancelled"),
    gte(dropInSessions.startsAt, now),
    lt(dropInSessions.startsAt, horizon),
  );
  const campSessionSelection = {
    sessionId: dropInSessions.id,
    sportOrClassLabel: dropInSessions.sportOrClassLabel,
    formatLabel: dropInSessions.formatLabel,
    startsAt: dropInSessions.startsAt,
    venueName: venues.name,
  };

  // Path A: day-session staffing — reuse the class_session assignments
  // already fetched above (they target drop_in_sessions rows generically).
  const assignedCampRows = sessionIds.length
    ? await db
        .select(campSessionSelection)
        .from(dropInSessions)
        .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
        .where(and(inArray(dropInSessions.id, sessionIds), campSessionWindow))
    : [];

  // Path B: pod coach — every day-session of a camp season whose teams
  // (camp groups) list this coach as lead or assistant.
  const podCampRows = await db
    .selectDistinctOn([dropInSessions.id], campSessionSelection)
    .from(dropInSessions)
    .innerJoin(teams, eq(teams.seasonId, dropInSessions.campSeasonId))
    .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        or(eq(teams.coachUserId, userId), eq(teams.assistantCoachUserId, userId)),
        campSessionWindow,
      ),
    )
    .orderBy(asc(dropInSessions.id));

  const campSessionById = new Map<string, CoachCampSession>();
  for (const row of [...assignedCampRows, ...podCampRows]) {
    if (campSessionById.has(row.sessionId)) continue;
    campSessionById.set(row.sessionId, {
      sessionId: row.sessionId,
      label: row.formatLabel
        ? `${row.sportOrClassLabel} · ${row.formatLabel}`
        : row.sportOrClassLabel,
      startsAt: row.startsAt,
      venueName: row.venueName,
    });
  }
  const campSessions = Array.from(campSessionById.values()).sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );

  return { teamIds, classGroups, campSessions };
}
