/**
 * Task 6 of the 2026-09-05-coach-classes-phase01 plan:
 * `GET`/`POST /api/coach/class-sessions/:id/glows` — the class-session
 * equivalent of `POST /api/coach/sessions/:id/glows` (Glows & Grows), but
 * anchoring `coach_notes` rows on `activityKind: 'class_session'` +
 * `activityId` instead of `teamId` (Task 1's dual-anchor migration).
 *
 * Auth is assignment-based (coaching_assignments), NOT the broad org-read
 * gate Task 5's roster endpoint uses: a coach must hold an ACTIVE
 * `class_session` assignment on THIS session, or an ACTIVE `class_template`
 * assignment on the session's template, to read OR write here — mirrors
 * the team glows.ts contract where GET and POST share one gate.
 *
 * Fixture shape: one template with two materialized sessions.
 *   - sessionA: coachA (coach@test.aspiresports.com) is assigned at the
 *     TEMPLATE level (covers every session of this template, including
 *     sessionA). coachB (training+coach@test.aspiresports.com) has NO
 *     assignment reaching sessionA -> 403 for coachB there.
 *   - sessionB: coachB additionally holds a session-only `class_session`
 *     assignment directly on sessionB (not the template) -> proves the
 *     session-level assignment path also grants access, independent of any
 *     template assignment.
 *
 * Two children are booked into sessionA: `childBooked` (confirmed) and
 * `childNotBooked` is a real fixture child who is NEVER booked into
 * sessionA — used to pin the 422 "not on this session's roster" rejection.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { coachNotes } from "@/lib/db/schema";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { apiFetch, getAuthCookie, getCoachCookie, getParentCookie } from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  createTestChild,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let coachAId: string;
let coachBId: string;
let coachACookie: string;
let coachBCookie: string;
let parentCookie: string;

let templateId: string;
let sessionAId: string;
let sessionBId: string;
let childBookedId: string;
let childNotBookedId: string;
let bookingAId: string;
let bookingBId: string;

const suffix = Date.now();

async function getBootstrap(sessionId: string, cookie?: string) {
  return apiFetch(`/api/coach/class-sessions/${sessionId}/glows`, { cookie });
}

async function postBatch(sessionId: string, body: unknown, cookie?: string) {
  return apiFetch(`/api/coach/class-sessions/${sessionId}/glows`, {
    method: "POST",
    cookie,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  await sweepOrphanedTestTemplates(organizationId);

  coachACookie = await getCoachCookie();
  coachBCookie = await getAuthCookie("training+coach@test.aspiresports.com", "TestCoach123!");
  parentCookie = await getParentCookie();

  const db = getDb();

  async function resolveOrgCoach(email: string): Promise<string> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.email, email),
          eq(roles.name, "coach"),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, organizationId),
        ),
      )
      .orderBy(asc(userRoles.createdAt))
      .limit(1);
    if (!row) {
      throw new Error(`class-glows.test: ${email} is not a seeded org coach — run npm run db:seed:e2e`);
    }
    return row.id;
  }

  coachAId = await resolveOrgCoach("coach@test.aspiresports.com");
  coachBId = await resolveOrgCoach("training+coach@test.aspiresports.com");

  // Hygiene: clear any leftover active class_template/class_session
  // assignments for coachB so the 403 assertion on sessionA can't be
  // polluted by debris from a prior/failed run.
  await db
    .update(coachingAssignments)
    .set({ active: false })
    .where(
      and(
        eq(coachingAssignments.coachUserId, coachBId),
        inArray(coachingAssignments.kind, ["class_template", "class_session"]),
      ),
    );

  templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `ClassGlows-${suffix}`,
    capacity: 10,
  });

  await db.insert(coachingAssignments).values({
    organizationId,
    coachUserId: coachAId,
    kind: "class_template",
    targetId: templateId,
    role: "lead",
  });

  childBookedId = await createTestChild(parentUserId, `ClassGlows-Booked-${suffix}`);
  childNotBookedId = await createTestChild(parentUserId, `ClassGlows-NotBooked-${suffix}`);

  const startsAtA = new Date(Date.now() + 3 * 86_400_000);
  const [sessionA] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "class",
      sportOrClassLabel: "Soccer",
      startsAt: startsAtA,
      endsAt: new Date(startsAtA.getTime() + 55 * 60_000),
      capacity: 10,
      classSlotTemplateId: templateId,
    })
    .returning();
  sessionAId = sessionA.id;

  const startsAtB = new Date(Date.now() + 4 * 86_400_000);
  const [sessionB] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "class",
      sportOrClassLabel: "Soccer",
      startsAt: startsAtB,
      endsAt: new Date(startsAtB.getTime() + 55 * 60_000),
      capacity: 10,
      classSlotTemplateId: templateId,
    })
    .returning();
  sessionBId = sessionB.id;

  // coachB's session-only assignment — deliberately NOT at the template
  // level, and only on sessionB (sessionA must stay unreachable for coachB).
  await db.insert(coachingAssignments).values({
    organizationId,
    coachUserId: coachBId,
    kind: "class_session",
    targetId: sessionBId,
    role: "lead",
  });

  const [bookingA] = await db
    .insert(dropInBookings)
    .values({
      sessionId: sessionAId,
      userId: parentUserId,
      familyMemberId: childBookedId,
      status: "confirmed",
      source: "auto_enrollment",
      paymentMethod: "member_allotment",
    })
    .returning();
  bookingAId = bookingA.id;

  const [bookingB] = await db
    .insert(dropInBookings)
    .values({
      sessionId: sessionBId,
      userId: parentUserId,
      familyMemberId: childBookedId,
      status: "confirmed",
      source: "auto_enrollment",
      paymentMethod: "member_allotment",
    })
    .returning();
  bookingBId = bookingB.id;
});

afterAll(async () => {
  const db = getDb();
  const sessionIds = [sessionAId, sessionBId].filter(Boolean);
  if (sessionIds.length > 0) {
    await db
      .delete(coachNotes)
      .where(and(eq(coachNotes.activityKind, "class_session"), inArray(coachNotes.activityId, sessionIds)));
  }
  if (bookingAId) await db.delete(dropInBookings).where(eq(dropInBookings.id, bookingAId));
  if (bookingBId) await db.delete(dropInBookings).where(eq(dropInBookings.id, bookingBId));
  if (sessionIds.length > 0) {
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, sessionIds));
  }
  await db
    .delete(coachingAssignments)
    .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId ?? "")));
  if (sessionBId) {
    await db
      .delete(coachingAssignments)
      .where(and(eq(coachingAssignments.kind, "class_session"), eq(coachingAssignments.targetId, sessionBId)));
  }
  if (childBookedId) await db.delete(familyMembers).where(eq(familyMembers.id, childBookedId));
  if (childNotBookedId) await db.delete(familyMembers).where(eq(familyMembers.id, childNotBookedId));
  if (templateId) await cleanupTestClassFixtures([templateId]);
});

describe("GET /api/coach/class-sessions/:id/glows", () => {
  it("401s for an anonymous caller", async () => {
    const res = await getBootstrap(sessionAId);
    expect(res.status).toBe(401);
  });

  it("403s for a parent", async () => {
    const res = await getBootstrap(sessionAId, parentCookie);
    expect(res.status).toBe(403);
  });

  it("403s for an org coach with no assignment reaching this session", async () => {
    const res = await getBootstrap(sessionAId, coachBCookie);
    expect(res.status).toBe(403);
  });

  it("returns the roster + chips for the template-assigned coach", async () => {
    const res = await getBootstrap(sessionAId, coachACookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    const rosterEntry = body.roster.find((r: { familyMemberId: string }) => r.familyMemberId === childBookedId);
    expect(rosterEntry).toBeDefined();
    expect(body.roster.find((r: { familyMemberId: string }) => r.familyMemberId === childNotBookedId)).toBeUndefined();
    expect(body.chips.glows).toContain("Great effort today");
    expect(Array.isArray(body.existingNotes)).toBe(true);
  });

  it("also grants access to a coach assigned directly on the session (not the template)", async () => {
    const res = await getBootstrap(sessionBId, coachBCookie);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/coach/class-sessions/:id/glows", () => {
  it("401s for an anonymous caller", async () => {
    const res = await postBatch(sessionAId, { entries: [{ familyMemberId: childBookedId, glows: ["Great effort today"] }] });
    expect(res.status).toBe(401);
  });

  it("403s for the unassigned coach", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Great effort today"] }] },
      coachBCookie,
    );
    expect(res.status).toBe(403);
  });

  it("rejects a child who is not booked into this session with 422", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: childNotBookedId, glows: ["Great effort today"] }] },
      coachACookie,
    );
    expect(res.status).toBe(422);
  });

  it("rejects a malformed batch with 400, never 500", async () => {
    const res = await postBatch(sessionAId, { entries: "not-an-array" }, coachACookie);
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects an entry with an invalid familyMemberId with 400, never 500", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: "not-a-uuid", glows: ["Great effort today"] }] },
      coachACookie,
    );
    expect(res.status).toBeLessThan(500);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("the template-assigned coach writes a glow for the booked child, anchored on the class session with teamId null", async () => {
    const res = await postBatch(
      sessionAId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Great effort today"], note: "Great session today" }] },
      coachACookie,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(1);
    expect(body.created[0].familyMemberId).toBe(childBookedId);

    const db = getDb();
    const [note] = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.familyMemberId, childBookedId),
          eq(coachNotes.activityKind, "class_session"),
          eq(coachNotes.activityId, sessionAId),
        ),
      );
    expect(note).toBeDefined();
    expect(note.teamId).toBeNull();
    expect(note.visibleToParent).toBe(true);
    expect(note.coachUserId).toBe(coachAId);
    expect(note.content).toContain("Great effort today");
  });

  it("the session-assigned coach (not template-assigned) can also write a glow", async () => {
    const res = await postBatch(
      sessionBId,
      { entries: [{ familyMemberId: childBookedId, glows: ["Kind teammate"] }] },
      coachBCookie,
    );
    expect(res.status).toBe(200);

    const db = getDb();
    const [note] = await db
      .select()
      .from(coachNotes)
      .where(
        and(
          eq(coachNotes.familyMemberId, childBookedId),
          eq(coachNotes.activityKind, "class_session"),
          eq(coachNotes.activityId, sessionBId),
        ),
      );
    expect(note).toBeDefined();
    expect(note.coachUserId).toBe(coachBId);
  });
});
