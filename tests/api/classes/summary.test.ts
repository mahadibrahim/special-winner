import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
import { familyMembers } from "@/lib/db/schema/registrations";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  cleanupTestMembershipTiers,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let cookie: string;
let testChildId: string;
let membershipId: string;
let sessionEarlyId: string;
let sessionLateId: string;

// Every fixture this file creates, so afterAll can retire it — same
// rationale as enrollments.test.ts's identically-named arrays.
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdTierIds: string[] = [];
const createdSessionIds: string[] = [];

async function authedGet(path: string): Promise<any> {
  const res = await apiFetch(path, { cookie });
  expect(res.status).toBe(200);
  return res.json();
}

function findChild(body: any, familyMemberId: string): any {
  const child = body.children.find((c: any) => c.familyMemberId === familyMemberId);
  if (!child) {
    throw new Error(`familyMemberId ${familyMemberId} not present in summary response`);
  }
  return child;
}

/** A `kind='class'`, `status='scheduled'` drop_in_sessions row plus a
 *  `confirmed` booking for `familyMemberId` — the shape the materialization
 *  cron produces, minted directly (no Stripe/cron in CI). Tracked in
 *  `createdSessionIds` for afterAll cleanup. */
async function bookFutureSession(familyMemberId: string, startsAt: Date): Promise<string> {
  const db = getDb();
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
  });
  createdSessionIds.push(ctx.sessionId);
  await db.insert(dropInBookings).values({
    sessionId: ctx.sessionId,
    userId: parentUserId,
    familyMemberId,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: "member_allotment",
    amountPaidCents: 0,
  });
  return ctx.sessionId;
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  const db = getDb();
  const suffix = Date.now();

  // Own tier (rather than the shared "Test Class Tier 4" fixture) so this
  // suite controls technicalMonthlyCents directly.
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId,
      name: `Summary-Tier-${suffix}`,
      monthlyPriceCents: 4900,
      benefits: { classes_per_month: 4 },
      technicalMonthlyCents: 900,
      isActive: true,
    })
    .returning();
  createdTierIds.push(tier.id);

  testChildId = await createTestChild(parentUserId, `Summary-${suffix}`);
  membershipId = await createTestChildMembership({
    userId: parentUserId,
    familyMemberId: testChildId,
    organizationId,
    tierId: tier.id,
    idSuffix: `summary-${suffix}`,
  });

  const templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `Summary-Slot-${suffix}`,
    capacity: 10,
  });
  createdTemplateIds.push(templateId);

  const enrollRes = await apiFetch("/api/classes/enrollments", {
    method: "POST",
    cookie,
    body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: testChildId }),
  });
  expect(enrollRes.status).toBe(200);
  const { enrollmentId } = await enrollRes.json();
  createdEnrollmentIds.push(enrollmentId);

  // Book two future sessions OUT of chronological insert order — the later
  // one first — so a passing "soonest-first" assertion can't be an accident
  // of insertion order.
  sessionLateId = await bookFutureSession(testChildId, new Date(Date.now() + 5 * 86_400_000));
  sessionEarlyId = await bookFutureSession(testChildId, new Date(Date.now() + 2 * 86_400_000));
});

afterAll(async () => {
  const db = getDb();
  if (createdSessionIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, createdSessionIds));
    await db
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  }
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
  await cleanupTestMembershipTiers(createdTierIds);
});

describe("GET /api/classes/summary", () => {
  it("returns 401 signed out", async () => {
    const res = await apiFetch("/api/classes/summary");
    expect(res.status).toBe(401);
  });

  it("exposes cancelWindowHours at the top level (number, default 24)", async () => {
    const body = await authedGet("/api/classes/summary");
    expect(typeof body.cancelWindowHours).toBe("number");
  });

  it("returns membership renewal fields and technical supplement", async () => {
    const body = await authedGet("/api/classes/summary");
    const child = findChild(body, testChildId);
    expect(child.membership).toMatchObject({
      cancelAtPeriodEnd: false,
      technicalMonthlyCents: 900,
    });
    // Fixture memberships are DB-minted without Stripe, so currentPeriodEnd
    // is never populated outside the subscription webhook path — renewsAt
    // is null here.
    expect(child.membership.renewsAt).toBeNull();
  });

  it("passes currentPeriodEnd through as an ISO string once it's set", async () => {
    const db = getDb();
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    await db
      .update(memberships)
      .set({ currentPeriodEnd: periodEnd })
      .where(eq(memberships.id, membershipId));

    try {
      const body = await authedGet("/api/classes/summary");
      const child = findChild(body, testChildId);
      expect(child.membership.renewsAt).toBe(periodEnd.toISOString());
    } finally {
      // Reset so later assertions in this file aren't order-dependent.
      await db
        .update(memberships)
        .set({ currentPeriodEnd: null })
        .where(eq(memberships.id, membershipId));
    }
  });

  it("returns kitSize from familyMembers", async () => {
    const db = getDb();
    await db.update(familyMembers).set({ kitSize: "YM" }).where(eq(familyMembers.id, testChildId));

    const body = await authedGet("/api/classes/summary");
    expect(findChild(body, testChildId).kitSize).toBe("YM");
  });

  it("lists ALL upcoming confirmed sessions soonest-first, and nextSession still equals the first", async () => {
    const body = await authedGet("/api/classes/summary");
    const child = findChild(body, testChildId);
    expect(child.upcomingSessions.length).toBe(2);
    const times = child.upcomingSessions.map((s: any) => s.startsAt);
    expect([...times].sort()).toEqual(times);
    expect(child.upcomingSessions[0].sessionId).toBe(sessionEarlyId);
    expect(child.upcomingSessions[1].sessionId).toBe(sessionLateId);
    expect(child.nextSession.sessionId).toBe(child.upcomingSessions[0].sessionId);
    expect(child.upcomingSessions[0]).toHaveProperty("bookingId");
  });

  it("caps upcomingSessions at 10", async () => {
    const suffix = Date.now();
    const cappedChildId = await createTestChild(parentUserId, `SummaryCap-${suffix}`);
    // No membership needed — upcomingSessions is booking-derived, not
    // membership-gated.
    for (let i = 0; i < 12; i++) {
      await bookFutureSession(cappedChildId, new Date(Date.now() + (10 + i) * 86_400_000));
    }

    const body = await authedGet("/api/classes/summary");
    const child = findChild(body, cappedChildId);
    expect(child.upcomingSessions.length).toBe(10);
  });
});
