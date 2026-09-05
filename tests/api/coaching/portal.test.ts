/**
 * Task 5 of the 2026-09-05-coach-classes-phase01 plan: the coach-portal
 * class endpoints — `GET /api/coach/classes` ("my classes") and
 * `GET /api/coach/classes/:templateId` (roster + upcoming sessions).
 *
 * Two seeded org-scoped `coach`-role users exist in the default test org
 * (coach@test.aspiresports.com, training+coach@test.aspiresports.com — same
 * fixtures tests/api/coaching/staffing.test.ts resolves dynamically). This
 * suite assigns the FIRST as the template's lead ("assigned coach") and
 * deliberately leaves the SECOND unassigned ("unassigned org coach") to pin
 * the three-tier §6.3 read/write gate:
 *   assigned coach -> writable: true
 *   unassigned org coach -> 200, writable: false (broad read gate)
 *   parent -> 403
 *   cross-org template id -> 404
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { classEnrollments, classCreditGrants } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { apiFetch, getAuthCookie, getCoachCookie, getParentCookie } from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  createTestChild,
  createTestCreditGrant,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let assignedCoachId: string;
let unassignedCoachId: string;
let assignedCoachCookie: string;
let unassignedCoachCookie: string;
let parentCookie: string;

let templateId: string;
let sessionId: string;
let childId: string;
let grantId: string;
let enrollmentId: string;
let bookingId: string;

let orgBTemplateId: string;

const createdTemplateIds: string[] = [];

async function getMyClasses(cookie?: string) {
  return apiFetch("/api/coach/classes", { cookie });
}

async function getClassRoster(id: string, cookie?: string) {
  return apiFetch(`/api/coach/classes/${id}`, { cookie });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  await sweepOrphanedTestTemplates(organizationId);

  assignedCoachCookie = await getCoachCookie();
  unassignedCoachCookie = await getAuthCookie("training+coach@test.aspiresports.com", "TestCoach123!");
  parentCookie = await getParentCookie();

  const db = getDb();
  // Resolve each seeded coach's id BY EMAIL, scoped to a real org-scoped
  // `coach` role (rather than relying on row order like staffing.test.ts,
  // which only needs "two distinct coaches") — this suite needs to know
  // WHICH id is which so it can assign exactly one and assert the other
  // stays unassigned.
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
      throw new Error(`portal.test: ${email} is not a seeded org coach — run npm run db:seed:e2e`);
    }
    return row.id;
  }

  assignedCoachId = await resolveOrgCoach("coach@test.aspiresports.com");
  unassignedCoachId = await resolveOrgCoach("training+coach@test.aspiresports.com");

  // Hygiene: clear any leftover active class_template/class_session
  // assignments for the "unassigned" coach from other suites/prior runs, so
  // the writable:false assertions below can't be polluted by debris.
  await db
    .update(coachingAssignments)
    .set({ active: false })
    .where(
      and(
        eq(coachingAssignments.coachUserId, unassignedCoachId),
        inArray(coachingAssignments.kind, ["class_template", "class_session"]),
      ),
    );

  templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `Portal-${Date.now()}`,
    capacity: 10,
  });
  createdTemplateIds.push(templateId);

  const [assignment] = await db
    .insert(coachingAssignments)
    .values({
      organizationId,
      coachUserId: assignedCoachId,
      kind: "class_template",
      targetId: templateId,
      role: "lead",
    })
    .returning();
  void assignment;

  childId = await createTestChild(parentUserId, `Portal-Child-${Date.now()}`);

  grantId = await createTestCreditGrant({
    organizationId,
    familyMemberId: childId,
    sessionsGranted: 10,
    idSuffix: `portal-${Date.now()}`,
  });

  const [enrollment] = await db
    .insert(classEnrollments)
    .values({ slotTemplateId: templateId, familyMemberId: childId, creditGrantId: grantId, status: "active" })
    .returning();
  enrollmentId = enrollment.id;

  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "class",
      sportOrClassLabel: "Soccer",
      startsAt,
      endsAt,
      capacity: 10,
      classSlotTemplateId: templateId,
    })
    .returning();
  sessionId = session.id;

  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId,
      userId: parentUserId,
      familyMemberId: childId,
      status: "confirmed",
      source: "auto_enrollment",
      paymentMethod: "member_allotment",
    })
    .returning();
  bookingId = booking.id;

  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  orgBTemplateId = await createTestClassTemplate({
    organizationId: orgBFixtures.org.id,
    venueId: orgBFixtures.venueId,
    name: `Portal-OrgB-${Date.now()}`,
    capacity: 5,
  });
  createdTemplateIds.push(orgBTemplateId);
});

afterAll(async () => {
  const db = getDb();
  if (bookingId) {
    await db.delete(dropInBookings).where(eq(dropInBookings.id, bookingId));
  }
  if (sessionId) {
    await db.delete(dropInSessions).where(eq(dropInSessions.id, sessionId));
  }
  await db
    .delete(coachingAssignments)
    .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId ?? "")));
  if (enrollmentId) {
    await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
  }
  if (grantId) {
    await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
  }
  if (childId) {
    await db.delete(familyMembers).where(eq(familyMembers.id, childId));
  }
  await cleanupTestClassFixtures(createdTemplateIds);
});

describe("GET /api/coach/classes", () => {
  it("401s for an anonymous caller", async () => {
    const res = await getMyClasses();
    expect(res.status).toBe(401);
  });

  it("403s for a parent (no coach role, no team assignment)", async () => {
    const res = await getMyClasses(parentCookie);
    expect(res.status).toBe(403);
  });

  it("returns the assigned coach's class groups, including the fixture template", async () => {
    const res = await getMyClasses(assignedCoachCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    const group = body.classGroups.find((g: { templateId: string }) => g.templateId === templateId);
    expect(group).toBeDefined();
    expect(group.role).toBe("lead");
    expect(group.sessionOnly).toBe(false);
  });

  it("does not list the fixture template for the unassigned coach", async () => {
    const res = await getMyClasses(unassignedCoachCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    const group = body.classGroups.find((g: { templateId: string }) => g.templateId === templateId);
    expect(group).toBeUndefined();
  });
});

describe("GET /api/coach/classes/:templateId", () => {
  it("401s for an anonymous caller", async () => {
    const res = await getClassRoster(templateId);
    expect(res.status).toBe(401);
  });

  it("403s for a parent", async () => {
    const res = await getClassRoster(templateId, parentCookie);
    expect(res.status).toBe(403);
  });

  it("404s for a template belonging to another org", async () => {
    const res = await getClassRoster(orgBTemplateId, assignedCoachCookie);
    expect(res.status).toBe(404);
  });

  it("returns full, writable access for the assigned coach with enrollments and upcoming sessions", async () => {
    const res = await getClassRoster(templateId, assignedCoachCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.writable).toBe(true);
    expect(body.role).toBe("lead");
    expect(body.template.id).toBe(templateId);

    const enrollment = body.enrollments.find((e: { familyMemberId: string }) => e.familyMemberId === childId);
    expect(enrollment).toBeDefined();
    expect(enrollment.age).not.toBeNull();

    const session = body.upcomingSessions.find((s: { sessionId: string }) => s.sessionId === sessionId);
    expect(session).toBeDefined();
    const booking = session.bookings.find((b: { familyMemberId: string }) => b.familyMemberId === childId);
    expect(booking).toBeDefined();
    expect(booking.status).toBe("confirmed");
  });

  it("returns read-only access (writable: false) for an unassigned org coach", async () => {
    const res = await getClassRoster(templateId, unassignedCoachCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.writable).toBe(false);
    expect(body.role).toBeNull();
    // Still gets the full roster data — this is a READ gate, not a redaction.
    const enrollment = body.enrollments.find((e: { familyMemberId: string }) => e.familyMemberId === childId);
    expect(enrollment).toBeDefined();
  });
});
