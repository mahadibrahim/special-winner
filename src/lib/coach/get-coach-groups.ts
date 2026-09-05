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
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getCoachTeamIds } from "@/lib/auth/roles";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";

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

export async function getCoachGroups(
  userId: string,
  organizationId: string,
): Promise<{
  teamIds: string[];
  classGroups: CoachClassGroup[];
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
        .where(inArray(classSlotTemplates.id, templateIds))
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

  return { teamIds, classGroups };
}
