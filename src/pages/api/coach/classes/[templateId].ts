/**
 * GET /api/coach/classes/:templateId
 *
 * Task 5 of the 2026-09-05-coach-classes-phase01 plan: the coach-portal
 * roster/session view for one class-slot template.
 *
 * Auth is a three-tier gate, per the scoping spec's §6.3 read/write split:
 *   1. No session → 401.
 *   2. Caller holds neither the `coach` role nor any team assignment
 *      (`requireCoachPortalAccess`'s base check) → 403. Parents/players
 *      never get past here.
 *   3. Otherwise, once the template is resolved (and confirmed to belong to
 *      the caller's organization — a cross-org id 404s, same as the admin
 *      roster endpoint):
 *        a. An active `class_template` assignment on this template, OR an
 *           active `class_session` assignment on one of ITS materialized
 *           sessions → `writable: true` (the coach actually runs this
 *           class, standing or as a substitute).
 *        b. Otherwise, `isOrgCoachingStaff` (holds the `coach` role scoped
 *           to this org) → `writable: false`. Per spec §6.3 this is the
 *           broad READ gate: any of the org's coaching staff can look up a
 *           class they don't run, they just can't act on it (Phase 2's
 *           write endpoints, not built here, would enforce that).
 *        c. Neither → 403. This is the case that actually excludes
 *           parents/players from requireCoachPortalAccess's coarser check
 *           when the caller image doesn't apply here, but is kept as
 *           defense-in-depth for a coach role scoped to a DIFFERENT org
 *           than the one this request resolved to.
 *
 * Response carries the template, the coach's own role on it (null when not
 * directly assigned), active enrollments (child name/age/kit size — same
 * shape as the admin roster), and the next `NEXT_SESSIONS_LIMIT` upcoming
 * sessions, each with its staffed coaches and a per-child booking breakdown
 * (status + check-in stamp) so a coach can see who's actually expected.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { requireCoachPortalAccess, isOrgCoachingStaff } from "@/lib/auth/roles";
import { getCoachesFor } from "@/lib/coach/coaching-assignments";
import { ageOnDate } from "@/lib/classes/book-child";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Seat-occupying booking statuses — mirrors
// admin/classes/templates/[id]/roster.ts's BOOKED_STATUSES. Waitlisted
// bookings haven't claimed a seat, so they're excluded from the roster view.
const BOOKED_STATUSES = ["confirmed", "pending_payment", "pending_claim"] as const;

// How many future sessions the coach roster view surfaces. A coach cares
// about "what's coming up soon", not the full materialization horizon.
const NEXT_SESSIONS_LIMIT = 8;

export const GET: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const templateId = context.params.templateId;
  if (!templateId) return json({ error: "Template id required" }, 400);

  const db = getDb();

  const [template] = await db
    .select()
    .from(classSlotTemplates)
    .where(and(eq(classSlotTemplates.id, templateId), eq(classSlotTemplates.organizationId, orgId)))
    .limit(1);
  if (!template) return json({ error: "Template not found" }, 404);

  // Tier (a): a standing assignment directly on the template.
  const [templateAssignment] = await db
    .select({ role: coachingAssignments.role })
    .from(coachingAssignments)
    .where(
      and(
        eq(coachingAssignments.organizationId, orgId),
        eq(coachingAssignments.coachUserId, auth.user.id),
        eq(coachingAssignments.kind, "class_template"),
        eq(coachingAssignments.targetId, templateId),
        eq(coachingAssignments.active, true),
      ),
    )
    .limit(1);

  let writable = false;
  let role: "lead" | "assistant" | null = null;

  if (templateAssignment) {
    writable = true;
    role = templateAssignment.role;
  } else {
    // Tier (a continued): a one-off substitute assignment on one of this
    // template's materialized sessions.
    const templateSessionIds = await db
      .select({ id: dropInSessions.id })
      .from(dropInSessions)
      .where(eq(dropInSessions.classSlotTemplateId, templateId));
    const sessionIdList = templateSessionIds.map((s) => s.id);

    if (sessionIdList.length > 0) {
      const [sessionAssignment] = await db
        .select({ role: coachingAssignments.role })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.organizationId, orgId),
            eq(coachingAssignments.coachUserId, auth.user.id),
            eq(coachingAssignments.kind, "class_session"),
            inArray(coachingAssignments.targetId, sessionIdList),
            eq(coachingAssignments.active, true),
          ),
        )
        .limit(1);
      if (sessionAssignment) {
        writable = true;
        role = sessionAssignment.role;
      }
    }
  }

  if (!writable) {
    // Tier (b)/(c): broad org-wide READ gate, per §6.3.
    const isStaff = await isOrgCoachingStaff(auth.user.id, orgId);
    if (!isStaff) {
      return json({ error: "Forbidden: not staffed on this class" }, 403);
    }
  }

  const now = new Date();

  const enrollmentRows = await db
    .select({
      enrollmentId: classEnrollments.id,
      familyMemberId: classEnrollments.familyMemberId,
      childFirstName: familyMembers.firstName,
      childLastName: familyMembers.lastName,
      birthDate: familyMembers.birthDate,
      kitSize: familyMembers.kitSize,
      startedAt: classEnrollments.startedAt,
    })
    .from(classEnrollments)
    .innerJoin(familyMembers, eq(classEnrollments.familyMemberId, familyMembers.id))
    .where(and(eq(classEnrollments.slotTemplateId, templateId), eq(classEnrollments.status, "active")))
    .orderBy(asc(classEnrollments.startedAt));

  const enrollments = enrollmentRows.map((row) => ({
    enrollmentId: row.enrollmentId,
    familyMemberId: row.familyMemberId,
    childName: `${row.childFirstName} ${row.childLastName}`,
    age: row.birthDate ? ageOnDate(row.birthDate, now) : null,
    kitSize: row.kitSize,
    startedAt: row.startedAt,
  }));

  const sessionRows = await db
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      capacity: dropInSessions.capacity,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.classSlotTemplateId, templateId),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.startsAt, now),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt))
    .limit(NEXT_SESSIONS_LIMIT);

  const sessionIds = sessionRows.map((s) => s.id);

  const bookingRows = sessionIds.length
    ? await db
        .select({
          sessionId: dropInBookings.sessionId,
          familyMemberId: dropInBookings.familyMemberId,
          status: dropInBookings.status,
          checkedInAt: dropInBookings.checkedInAt,
          childFirstName: familyMembers.firstName,
          childLastName: familyMembers.lastName,
          bookerFirstName: users.firstName,
          bookerLastName: users.lastName,
        })
        .from(dropInBookings)
        .leftJoin(familyMembers, eq(familyMembers.id, dropInBookings.familyMemberId))
        .innerJoin(users, eq(users.id, dropInBookings.userId))
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, BOOKED_STATUSES),
          ),
        )
    : [];

  const bookingsBySession = new Map<
    string,
    Array<{
      familyMemberId: string | null;
      childName: string;
      status: string;
      checkedInAt: Date | null;
    }>
  >();
  for (const b of bookingRows) {
    const list = bookingsBySession.get(b.sessionId) ?? [];
    list.push({
      familyMemberId: b.familyMemberId,
      // Class sessions are normally child-only, but fall back to the
      // booker's own name for the rare adult-booked row rather than
      // dropping it from the roster silently.
      childName: b.familyMemberId
        ? `${b.childFirstName} ${b.childLastName}`
        : `${b.bookerFirstName} ${b.bookerLastName}`,
      status: b.status,
      checkedInAt: b.checkedInAt,
    });
    bookingsBySession.set(b.sessionId, list);
  }

  const upcomingSessions = await Promise.all(
    sessionRows.map(async (session) => ({
      sessionId: session.id,
      startsAt: session.startsAt,
      capacity: session.capacity,
      coaches: await getCoachesFor("class_session", session.id),
      bookings: bookingsBySession.get(session.id) ?? [],
    })),
  );

  return json(
    {
      writable,
      role,
      template: {
        id: template.id,
        name: template.name,
        weekday: template.weekday,
        startTime: template.startTime,
        sportLabel: template.sportLabel,
        capacity: template.capacity,
      },
      enrollments,
      upcomingSessions,
    },
    200,
  );
};
