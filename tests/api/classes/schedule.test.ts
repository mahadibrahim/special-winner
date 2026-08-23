import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
});

describe("GET /api/public/class-schedule", () => {
  it("includes the seeded 'Test Class Slot' fixture with a sane shape", async () => {
    // Loose assertions only — this fixture is shared across the whole
    // staging DB (seed-e2e-tests.ts Stage 13c), so other concurrent test
    // runs can enroll into it and shift enrolledCount/spotsLeft. Exact-count
    // scenarios below create their own dedicated, unshared templates.
    const res = await apiFetch("/api/public/class-schedule");
    expect(res.status).toBe(200);
    const body = await res.json();
    const slot = body.slots.find((s: any) => s.name === "Test Class Slot");
    expect(slot).toBeTruthy();
    expect(slot.capacity).toBe(12);
    expect(slot.sportLabel).toBe("Soccer");
    expect(typeof slot.venueName).toBe("string");
    expect(typeof slot.locationName).toBe("string");
    expect(typeof slot.enrolledCount).toBe("number");
    expect(slot.spotsLeft).toBeGreaterThanOrEqual(0);
  });

  it("is reachable anonymously and reflects a slot's enrolledCount/spotsLeft", async () => {
    const db = getDb();
    const suffix = Date.now();
    const weekday = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).getUTCDay();
    const [template] = await db
      .insert(classSlotTemplates)
      .values({
        organizationId,
        venueId,
        name: `Schedule-Slot-${suffix}`,
        sportLabel: "Soccer",
        weekday,
        startTime: "15:30:00",
        durationMins: 55,
        capacity: 5,
        active: true,
      })
      .returning();

    // Anonymous — no cookie.
    const res1 = await apiFetch("/api/public/class-schedule");
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(Array.isArray(body1.slots)).toBe(true);
    expect(Array.isArray(body1.sessions)).toBe(true);

    const slot1 = body1.slots.find((s: any) => s.templateId === template.id);
    expect(slot1).toBeTruthy();
    expect(slot1.capacity).toBe(5);
    expect(slot1.enrolledCount).toBe(0);
    expect(slot1.spotsLeft).toBe(5);
    expect(slot1.sportLabel).toBe("Soccer");
    expect(typeof slot1.venueName).toBe("string");
    expect(typeof slot1.locationName).toBe("string");

    const childId = await createTestChild(parentUserId, `ScheduleEnroll-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `sched-${suffix}`,
    });
    const enrollRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: template.id, familyMemberId: childId }),
    });
    expect(enrollRes.status).toBe(200);

    const res2 = await apiFetch("/api/public/class-schedule");
    const body2 = await res2.json();
    const slot2 = body2.slots.find((s: any) => s.templateId === template.id);
    expect(slot2.enrolledCount).toBe(1);
    expect(slot2.spotsLeft).toBe(4);
  });

  it("lists a materialized session in the next-14-days window with bookedCount/spotsLeft", async () => {
    const db = getDb();
    const suffix = Date.now();
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const [session] = await db
      .insert(dropInSessions)
      .values({
        organizationId,
        venueId,
        kind: "class",
        sportOrClassLabel: "Soccer",
        formatLabel: `Schedule-Session-${suffix}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 55 * 60_000),
        capacity: 6,
        audience: "youth",
        status: "scheduled",
      })
      .returning();

    const res1 = await apiFetch("/api/public/class-schedule");
    const body1 = await res1.json();
    const found1 = body1.sessions.find((s: any) => s.id === session.id);
    expect(found1).toBeTruthy();
    expect(found1.capacity).toBe(6);
    expect(found1.bookedCount).toBe(0);
    expect(found1.spotsLeft).toBe(6);

    const childId = await createTestChild(parentUserId, `ScheduleBooker-${suffix}`);
    const bookRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: session.id,
        familyMemberId: childId,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(bookRes.status).toBe(200);

    const res2 = await apiFetch("/api/public/class-schedule");
    const body2 = await res2.json();
    const found2 = body2.sessions.find((s: any) => s.id === session.id);
    expect(found2.bookedCount).toBe(1);
    expect(found2.spotsLeft).toBe(5);
  });
});

describe("GET /api/classes/summary", () => {
  it("401s anonymously", async () => {
    const res = await apiFetch("/api/classes/summary");
    expect(res.status).toBe(401);
  });

  it("returns a per-child row with membership/enrollment/trial shape", async () => {
    const db = getDb();
    const suffix = Date.now();
    // GET /api/classes/summary caps at the 20 OLDEST children of the caller
    // (summary.ts's documented MAX_CHILDREN bound) — the shared
    // parent@test.aspiresports.com account has accumulated 150+
    // family_members rows across years of test runs on shared staging, so a
    // freshly-inserted child there would never appear in this response.
    // A brand-new throwaway user (createTestUserWithPassword) sidesteps that
    // cap; using the seed's own "fresh@test.aspiresports.com" account
    // instead would work UNTIL the next `npm run db:seed:e2e`, which
    // unconditionally wipes that account's family_members to keep it
    // "truly fresh" — a leftover membership row there RESTRICT-blocks that
    // delete and breaks the seed for everyone.
    const summaryUser = await createTestUserWithPassword();
    const summaryCookie = await getAuthCookie(summaryUser.email, summaryUser.password);
    const childId = await createTestChild(summaryUser.userId, `SummaryChild-${suffix}`);
    await createTestChildMembership({
      userId: summaryUser.userId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `summary-${suffix}`,
    });

    const weekday = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).getUTCDay();
    const [template] = await db
      .insert(classSlotTemplates)
      .values({
        organizationId,
        venueId,
        name: `Summary-Slot-${suffix}`,
        sportLabel: "Soccer",
        weekday,
        startTime: "16:00:00",
        durationMins: 55,
        capacity: 8,
        active: true,
      })
      .returning();
    const enrollRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie: summaryCookie,
      body: JSON.stringify({ slotTemplateId: template.id, familyMemberId: childId }),
    });
    expect(enrollRes.status).toBe(200);

    const res = await apiFetch("/api/classes/summary", { cookie: summaryCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.children)).toBe(true);
    const row = body.children.find((c: any) => c.familyMemberId === childId);
    expect(row).toBeTruthy();
    expect(row.membership).toMatchObject({ tierName: "Test Class Tier 4", status: "active" });
    // Fresh membership, zero usage this month — the full cap is remaining.
    expect(row.membership.classAllotmentRemaining).toBe(4);
    expect(row.enrollment).toMatchObject({
      templateId: template.id,
      weekday,
      startTime: "16:00:00",
    });
    expect(row.nextSession).toBeNull();
    expect(typeof row.trialUsed).toBe("boolean");
    expect(row.trialUsed).toBe(false);
  });
});
