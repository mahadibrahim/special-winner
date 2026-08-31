/**
 * Admin class-slot-template CRUD + roster API tests.
 *
 * Covers:
 *   - POST/GET/PUT org-scoping (cross-org ids 404, list never leaks another
 *     org's templates).
 *   - Deactivation with teeth: `PUT { active: false, cancelFutureSessions: true }`
 *     cancels future scheduled sessions materialized from the template and
 *     reports counts.
 *   - Schedule-change notice: a PUT that changes weekday/startTime while the
 *     template has active enrollments emails each enrolled family (asserted
 *     via the MESSAGING_MOCK=1 inbox, same pattern as tests/api/dropin/notify.test.ts).
 *   - Rate propagation: a PUT that changes sessionRate/memberRate rewrites the
 *     new rates onto FUTURE materialized sessions (which is what the charge
 *     paths price off) while leaving already-started sessions alone.
 *   - GET roster shape: active enrollments + upcoming sessions with seat counts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let adminCookie: string;

let orgBId: string;
let orgBVenueId: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  adminCookie = await getAdminCookie();
  await sweepOrphanedTestTemplates(organizationId);

  const orgBFixtureRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
  if (orgBFixtureRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBFixtureRes.status}). ` +
        "Ensure E2E_TEST_ENDPOINTS=yes is set and the e2e seed has been run.",
    );
  }
  const orgBFixtures = await orgBFixtureRes.json();
  orgBId = orgBFixtures.org.id;
  orgBVenueId = orgBFixtures.venueId;
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
});

function templateBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `Admin-Body-${Date.now()}`,
    venueId,
    sportLabel: "Soccer",
    minAge: null,
    maxAge: null,
    weekday: 2,
    startTime: "10:00",
    durationMins: 55,
    capacity: 5,
    sessionRateDollars: null,
    memberRateDollars: null,
    active: true,
    ...overrides,
  };
}

describe("POST /api/admin/classes/templates", () => {
  it("creates a template, converting dollars to cents at the boundary", async () => {
    const suffix = Date.now();
    const res = await apiFetch("/api/admin/classes/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({
          name: `Admin-Create-${suffix}`,
          sessionRateDollars: 25,
          memberRateDollars: 15.5,
        }),
      ),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    createdTemplateIds.push(body.template.id);
    expect(body.template.name).toBe(`Admin-Create-${suffix}`);
    expect(body.template.organizationId).toBe(organizationId);
    expect(body.template.sessionRateCents).toBe(2500);
    expect(body.template.memberRateCents).toBe(1550);
    expect(body.template.active).toBe(true);
  });

  it("422s on an invalid body (missing venueId)", async () => {
    const { venueId: _drop, ...bad } = templateBody({ name: `Admin-Invalid-${Date.now()}` });
    const res = await apiFetch("/api/admin/classes/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify(bad),
    });
    expect(res.status).toBe(422);
  });

  it("404s when venueId belongs to another org", async () => {
    const res = await apiFetch("/api/admin/classes/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({ name: `Admin-CrossVenue-${Date.now()}`, venueId: orgBVenueId }),
      ),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/classes/templates", () => {
  it("lists only the caller's org templates", async () => {
    const suffix = Date.now();
    const ownId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-List-${suffix}`,
      capacity: 5,
    });
    createdTemplateIds.push(ownId);

    // A template belonging to Org B — must never leak into Org A's list.
    const db = getDb();
    const [orgBTemplate] = await db
      .insert(classSlotTemplates)
      .values({
        organizationId: orgBId,
        venueId: orgBVenueId,
        name: `Admin-List-OrgB-${suffix}`,
        weekday: 2,
        startTime: "10:00:00",
        capacity: 5,
      })
      .returning();
    createdTemplateIds.push(orgBTemplate.id);

    const res = await apiFetch("/api/admin/classes/templates", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.templates.map((t: any) => t.id);
    expect(ids).toContain(ownId);
    expect(ids).not.toContain(orgBTemplate.id);
  });
});

describe("PUT /api/admin/classes/templates/:id", () => {
  it("updates a template's fields and 404s on a cross-org id", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-Update-${suffix}`,
      capacity: 5,
      weekday: 2,
      startTime: "10:00:00",
    });
    createdTemplateIds.push(templateId);

    const res = await apiFetch(`/api/admin/classes/templates/${templateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({ name: `Admin-Update-${suffix}-Renamed`, capacity: 8, weekday: 2, startTime: "10:00" }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.name).toBe(`Admin-Update-${suffix}-Renamed`);
    expect(body.template.capacity).toBe(8);
    expect(body.familiesNotified).toBe(0);
    expect(body.sessionsCancelled).toBeUndefined();

    // Cross-org: Org A admin can't edit Org B's template via a guessed id.
    const db = getDb();
    const [orgBTemplate] = await db
      .insert(classSlotTemplates)
      .values({
        organizationId: orgBId,
        venueId: orgBVenueId,
        name: `Admin-Update-OrgB-${suffix}`,
        weekday: 2,
        startTime: "10:00:00",
        capacity: 5,
      })
      .returning();
    createdTemplateIds.push(orgBTemplate.id);

    const crossRes = await apiFetch(`/api/admin/classes/templates/${orgBTemplate.id}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(templateBody({ name: "should-not-apply" })),
    });
    expect(crossRes.status).toBe(404);
  });

  it("propagates a rate edit onto future materialized sessions but never a started one", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-Reprice-${suffix}`,
      capacity: 5,
      weekday: 2,
      startTime: "10:00:00",
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    createdTemplateIds.push(templateId);

    // Two already-materialized sessions carrying the template's ORIGINAL
    // rates — the copy materialize.ts makes at insert time, which is what the
    // charge paths actually price off.
    const db = getDb();
    const now = Date.now();
    const sessionValues = (startsAt: Date) => ({
      organizationId,
      venueId,
      kind: "class" as const,
      sportOrClassLabel: "Soccer",
      classSlotTemplateId: templateId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 55 * 60 * 1000),
      capacity: 5,
      audience: "youth" as const,
      status: "scheduled" as const,
      sessionRateCents: 2500,
      memberRateCents: 1500,
    });
    const [futureSession] = await db
      .insert(dropInSessions)
      .values(sessionValues(new Date(now + 3 * 24 * 60 * 60 * 1000)))
      .returning();
    const [startedSession] = await db
      .insert(dropInSessions)
      .values(sessionValues(new Date(now - 3 * 24 * 60 * 60 * 1000)))
      .returning();

    const res = await apiFetch(`/api/admin/classes/templates/${templateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({
          name: `Admin-Reprice-${suffix}`,
          weekday: 2,
          startTime: "10:00",
          sessionRateDollars: 30,
          memberRateDollars: 20,
        }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.sessionRateCents).toBe(3000);
    expect(body.template.memberRateCents).toBe(2000);
    // Only the future one. Other suites' sessions can't inflate this: the
    // template is unique to this run.
    expect(body.sessionsRepriced).toBe(1);

    const [futureRow] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, futureSession.id));
    expect(futureRow.sessionRateCents).toBe(3000);
    expect(futureRow.memberRateCents).toBe(2000);

    // A class that has already started was SOLD at the old price — rewriting
    // it would retroactively contradict receipts.
    const [startedRow] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, startedSession.id));
    expect(startedRow.sessionRateCents).toBe(2500);
    expect(startedRow.memberRateCents).toBe(1500);

    // A no-op rate edit must not touch anything.
    const noopRes = await apiFetch(`/api/admin/classes/templates/${templateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({
          name: `Admin-Reprice-${suffix}`,
          weekday: 2,
          startTime: "10:00",
          sessionRateDollars: 30,
          memberRateDollars: 20,
        }),
      ),
    });
    expect(noopRes.status).toBe(200);
    expect((await noopRes.json()).sessionsRepriced).toBe(0);
  });

  it("emails each actively-enrolled family when weekday/startTime changes", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-Notify-${suffix}`,
      capacity: 5,
      weekday: 2,
      startTime: "10:00:00",
    });
    createdTemplateIds.push(templateId);

    const childId = await createTestChild(parentUserId, `NotifyChild-${suffix}`);
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `notify-${suffix}`,
    });
    const db = getDb();
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, membershipId })
      .returning();
    createdEnrollmentIds.push(enrollment.id);

    const since = new Date().toISOString();
    const res = await apiFetch(`/api/admin/classes/templates/${templateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({ name: `Admin-Notify-${suffix}`, weekday: 4, startTime: "11:30" }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.familiesNotified).toBe(1);

    const parentEmail = "parent@test.aspiresports.com";
    const mockRes = await apiFetch(
      `/api/test/messaging-mock?to=${encodeURIComponent(parentEmail)}` +
        `&channel=email&since=${encodeURIComponent(since)}`,
    );
    expect(mockRes.status, "messaging mock endpoint (needs E2E_TEST_ENDPOINTS=yes)").toBe(200);
    const mockBody = (await mockRes.json()) as { enabled: boolean; messages: { body: string }[] };
    expect(mockBody.enabled, "MESSAGING_MOCK must be on for this suite").toBe(true);
    expect(mockBody.messages.length).toBeGreaterThan(0);
    expect(mockBody.messages.at(-1)!.body).toMatch(/schedule/i);
  });

  it("cancels future scheduled sessions and reports counts on active:false + cancelFutureSessions", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-Deactivate-${suffix}`,
      capacity: 5,
      weekday: 2,
      startTime: "10:00:00",
    });
    createdTemplateIds.push(templateId);

    const childId = await createTestChild(parentUserId, `DeactivateChild-${suffix}`);
    const now = Date.now();
    const db = getDb();
    const [sessionWithBooking] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        classSlotTemplateId: templateId,
        startsAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now + 3 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000),
        capacity: 5,
        audience: "youth",
        status: "scheduled",
      })
      .returning();
    const [sessionEmpty] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        classSlotTemplateId: templateId,
        startsAt: new Date(now + 10 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now + 10 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000),
        capacity: 5,
        audience: "youth",
        status: "scheduled",
      })
      .returning();

    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: sessionWithBooking.id,
        userId: parentUserId,
        familyMemberId: childId,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "trial",
        amountPaidCents: 0,
      })
      .returning();

    const res = await apiFetch(`/api/admin/classes/templates/${templateId}`, {
      method: "PUT",
      cookie: adminCookie,
      body: JSON.stringify(
        templateBody({
          name: `Admin-Deactivate-${suffix}`,
          weekday: 2,
          startTime: "10:00",
          active: false,
          cancelFutureSessions: true,
        }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.active).toBe(false);
    expect(body.sessionsCancelled).toBe(2);
    // A $0 trial booking has no Stripe payment intent, so nothing to refund —
    // it still gets cancelled, just not counted as "refunded".
    expect(body.bookingsRefunded).toBe(0);

    const [withBookingRow] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionWithBooking.id));
    expect(withBookingRow.status).toBe("cancelled");
    const [emptyRow] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionEmpty.id));
    expect(emptyRow.status).toBe("cancelled");
    const [bookingRow] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(bookingRow.status).toBe("cancelled");
  });
});

describe("GET /api/admin/classes/templates/:id/roster", () => {
  it("404s on a cross-org id", async () => {
    const db = getDb();
    const suffix = Date.now();
    const [orgBTemplate] = await db
      .insert(classSlotTemplates)
      .values({
        organizationId: orgBId,
        venueId: orgBVenueId,
        name: `Admin-Roster-OrgB-${suffix}`,
        weekday: 2,
        startTime: "10:00:00",
        capacity: 5,
      })
      .returning();
    createdTemplateIds.push(orgBTemplate.id);

    const res = await apiFetch(`/api/admin/classes/templates/${orgBTemplate.id}/roster`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });

  it("returns active enrollments and upcoming sessions with seat counts", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Admin-Roster-${suffix}`,
      capacity: 10,
      weekday: 2,
      startTime: "10:00:00",
    });
    createdTemplateIds.push(templateId);

    const childA = await createTestChild(parentUserId, `RosterA-${suffix}`, "2018-06-15");
    const membershipA = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childA,
      organizationId,
      tierId,
      idSuffix: `rostera-${suffix}`,
    });
    const childB = await createTestChild(parentUserId, `RosterB-${suffix}`, "2016-01-01");
    const membershipB = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childB,
      organizationId,
      tierId,
      idSuffix: `rosterb-${suffix}`,
    });

    const db = getDb();
    const [enrollA] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childA, membershipId: membershipA })
      .returning();
    const [enrollB] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childB, membershipId: membershipB })
      .returning();
    createdEnrollmentIds.push(enrollA.id, enrollB.id);

    const now = Date.now();
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        classSlotTemplateId: templateId,
        startsAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
        endsAt: new Date(now + 3 * 24 * 60 * 60 * 1000 + 55 * 60 * 1000),
        capacity: 10,
        audience: "youth",
        status: "scheduled",
      })
      .returning();

    await db.insert(dropInBookings).values([
      {
        sessionId: session.id,
        userId: parentUserId,
        familyMemberId: childA,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
      },
      {
        sessionId: session.id,
        userId: parentUserId,
        familyMemberId: childB,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "trial",
        amountPaidCents: 0,
      },
      {
        sessionId: session.id,
        userId: parentUserId,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "trial",
        amountPaidCents: 0,
      },
    ]);

    const res = await apiFetch(`/api/admin/classes/templates/${templateId}/roster`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.id).toBe(templateId);

    expect(body.enrollments).toHaveLength(2);
    const names = body.enrollments.map((e: any) => e.childName).sort();
    expect(names).toEqual([`RosterA-${suffix} Test`, `RosterB-${suffix} Test`].sort());
    const enrollmentA = body.enrollments.find((e: any) => e.familyMemberId === childA);
    expect(typeof enrollmentA.age).toBe("number");

    expect(body.upcomingSessions).toHaveLength(1);
    const upcoming = body.upcomingSessions[0];
    expect(upcoming.sessionId).toBe(session.id);
    expect(upcoming.capacity).toBe(10);
    // 2 confirmed (member + trial) count as booked; the waitlisted booking does not.
    expect(upcoming.bookedCount).toBe(2);
    expect(upcoming.trialCount).toBe(1);
  });
});
