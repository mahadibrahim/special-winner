import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { classPackProducts, classCreditGrants } from "@/lib/db/schema/classes";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  createTestCreditGrant,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;

// Every template / enrollment this file creates, so afterAll can retire
// them — see cleanupTestClassFixtures's doc comment (tests/utils/classes-helpers.ts)
// for why leaked templates directly slow down the materialization cron.
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];

// The two summary "credits" tests below create a real, ACTIVE
// class_pack_products row (visible on the live /youth/classes pricing
// ladder — src/lib/classes/ladder-model.ts's packs rung — until it's
// cleaned up) plus its grants and a couple of drop_in_sessions rows. Same
// self-cleaning convention as admin-class-packs.test.ts: grants deleted
// BEFORE their pack (class_credit_grants.pack_product_id is ON DELETE
// RESTRICT), sessions deleted last (cascades their bookings — see
// drop_in_bookings.session_id's ON DELETE CASCADE).
const createdPackIds: string[] = [];
const createdCreditGrantIds: string[] = [];
const createdSummarySessionIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  // One-time hygiene for orphans from before this cleanup existed — safe
  // here since tests/api runs with fileParallelism:false.
  await sweepOrphanedTestTemplates(organizationId);
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);

  const db = getDb();
  if (createdCreditGrantIds.length > 0) {
    await db.delete(classCreditGrants).where(inArray(classCreditGrants.id, createdCreditGrantIds));
  }
  if (createdPackIds.length > 0) {
    await db.delete(classPackProducts).where(inArray(classPackProducts.id, createdPackIds));
  }
  if (createdSummarySessionIds.length > 0) {
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, createdSummarySessionIds));
  }
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
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Schedule-Slot-${suffix}`,
      capacity: 5,
      startTime: "15:30:00",
    });
    createdTemplateIds.push(templateId);

    // Anonymous — no cookie.
    const res1 = await apiFetch("/api/public/class-schedule");
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(Array.isArray(body1.slots)).toBe(true);
    expect(Array.isArray(body1.sessions)).toBe(true);

    const slot1 = body1.slots.find((s: any) => s.templateId === templateId);
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
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(enrollRes.status).toBe(200);
    const { enrollmentId } = await enrollRes.json();
    createdEnrollmentIds.push(enrollmentId);

    const res2 = await apiFetch("/api/public/class-schedule");
    const body2 = await res2.json();
    const slot2 = body2.slots.find((s: any) => s.templateId === templateId);
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
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Summary-Slot-${suffix}`,
      capacity: 8,
      weekday,
      startTime: "16:00:00",
    });
    createdTemplateIds.push(templateId);

    const enrollRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie: summaryCookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(enrollRes.status).toBe(200);
    const { enrollmentId } = await enrollRes.json();
    createdEnrollmentIds.push(enrollmentId);

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
      templateId,
      weekday,
      startTime: "16:00:00",
    });
    expect(row.nextSession).toBeNull();
    expect(typeof row.trialUsed).toBe("boolean");
    expect(row.trialUsed).toBe(false);
  });

  it("exposes active class-credit balances and excludes exhausted/expired grants", async () => {
    const suffix = Date.now();
    const summaryUser = await createTestUserWithPassword();
    const summaryCookie = await getAuthCookie(summaryUser.email, summaryUser.password);
    const childId = await createTestChild(summaryUser.userId, `CreditsChild-${suffix}`);

    const db = getDb();
    const [pack] = await db
      .insert(classPackProducts)
      .values({
        organizationId,
        name: `Summary-Pack-${suffix}`,
        sessionCount: 6,
        priceCents: 9900,
        expiryMonths: 3,
      })
      .returning();
    createdPackIds.push(pack.id);

    // Active — 6 granted, 0 used, expires well in the future.
    const activeGrantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 6,
      packProductId: pack.id,
      idSuffix: `active-${suffix}`,
    });
    createdCreditGrantIds.push(activeGrantId);

    // Expired — expiresAt in the past, so it must never appear even though
    // its balance would otherwise be positive.
    const expiredGrantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 2,
      packProductId: pack.id,
      idSuffix: `expired-${suffix}`,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    createdCreditGrantIds.push(expiredGrantId);

    // Exhausted — 1 granted, then fully consumed by a confirmed booking
    // against it, so remaining hits 0 and it must be excluded too.
    const exhaustedGrantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 1,
      packProductId: pack.id,
      idSuffix: `exhausted-${suffix}`,
    });
    createdCreditGrantIds.push(exhaustedGrantId);
    const { sessionId: consumedSessionId } = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
    });
    createdSummarySessionIds.push(consumedSessionId);
    await db.insert(dropInBookings).values({
      sessionId: consumedSessionId,
      userId: summaryUser.userId,
      familyMemberId: childId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "pack_credit",
      creditGrantId: exhaustedGrantId,
    });

    const res = await apiFetch("/api/classes/summary", { cookie: summaryCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.children.find((c: any) => c.familyMemberId === childId);
    expect(row).toBeTruthy();
    expect(Array.isArray(row.credits)).toBe(true);
    expect(row.credits).toHaveLength(1);
    expect(row.credits[0]).toMatchObject({
      source: "pack",
      remaining: 6,
      label: `Summary-Pack-${suffix}`,
    });
    expect(typeof row.credits[0].expiresAt).toBe("string");
  });

  it("flags waiver-on-file and prior-booking state per child", async () => {
    const suffix = Date.now();
    const summaryUser = await createTestUserWithPassword();
    const summaryCookie = await getAuthCookie(summaryUser.email, summaryUser.password);

    // Fresh child: no waiver, no bookings at all.
    const freshChildId = await createTestChild(summaryUser.userId, `FreshChild-${suffix}`);

    // Waivered child: one booking on file with waiverSigned = true.
    const waiveredChildId = await createTestChild(summaryUser.userId, `WaiveredChild-${suffix}`);
    const db = getDb();
    const { sessionId: waiveredSessionId } = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
    });
    createdSummarySessionIds.push(waiveredSessionId);
    await db.insert(dropInBookings).values({
      sessionId: waiveredSessionId,
      userId: summaryUser.userId,
      familyMemberId: waiveredChildId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "trial",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Summary Test Parent",
    });

    const res = await apiFetch("/api/classes/summary", { cookie: summaryCookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    const freshRow = body.children.find((c: any) => c.familyMemberId === freshChildId);
    expect(freshRow.hasWaiverOnFile).toBe(false);
    expect(freshRow.hasEverBooked).toBe(false);

    const waiveredRow = body.children.find((c: any) => c.familyMemberId === waiveredChildId);
    expect(waiveredRow.hasWaiverOnFile).toBe(true);
    expect(waiveredRow.hasEverBooked).toBe(true);
  });
});
