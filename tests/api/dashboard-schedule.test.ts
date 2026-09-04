import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { apiFetch, getAuthCookie, getCoachCookie } from "./setup/test-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  cleanupTestMembershipTiers,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let cookie: string;
let testChildId: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdSessionIds: string[] = [];
const createdTierIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  const suffix = Date.now();
  testChildId = await createTestChild(parentUserId, `Schedule-${suffix}`);

  // enrollChild requires an active class-benefit membership on the child
  // (same "no_membership" 403 gate summary.test.ts's fixtures work around) —
  // own tier so this suite doesn't depend on/interfere with the shared
  // "Test Class Tier 4" fixture's benefit shape.
  const db0 = getDb();
  const [tier] = await db0
    .insert(membershipTiers)
    .values({
      organizationId,
      name: `Schedule-Tier-${suffix}`,
      monthlyPriceCents: 4900,
      benefits: { classes_per_month: 4 },
      isActive: true,
    })
    .returning();
  createdTierIds.push(tier.id);
  await createTestChildMembership({
    userId: parentUserId,
    familyMemberId: testChildId,
    organizationId,
    tierId: tier.id,
    idSuffix: `schedule-${suffix}`,
  });

  // A confirmed, future booked class session — the "firm event" leg.
  const { sessionId } = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt: new Date(Date.now() + 2 * 86_400_000),
  });
  createdSessionIds.push(sessionId);
  const db = getDb();
  await db.insert(dropInBookings).values({
    sessionId,
    userId: parentUserId,
    familyMemberId: testChildId,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: "member_allotment",
    amountPaidCents: 0,
  });

  // An active standing enrollment — the "projected" leg (beyond the
  // materialization horizon, since we don't run the cron in this suite).
  const templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `Schedule-Slot-${suffix}`,
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

describe("GET /api/dashboard/schedule", () => {
  it("returns 401 signed out", async () => {
    const res = await apiFetch("/api/dashboard/schedule");
    expect(res.status).toBe(401);
  });

  it("returns booked and projected events, all scoped to the caller's children", async () => {
    const res = await apiFetch("/api/dashboard/schedule", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    const childIds = new Set(body.children.map((c: any) => c.id));
    expect(childIds.has(testChildId)).toBe(true);

    for (const event of body.events) {
      expect(childIds.has(event.childId)).toBe(true);
    }

    const bookedEvents = body.events.filter((e: any) => e.projected === false);
    const projectedEvents = body.events.filter((e: any) => e.projected === true);
    expect(bookedEvents.length).toBeGreaterThanOrEqual(1);
    expect(projectedEvents.length).toBeGreaterThanOrEqual(1);

    const ourBooked = bookedEvents.find((e: any) => e.bookingId && e.childId === testChildId);
    expect(ourBooked).toBeTruthy();
    expect(ourBooked.bookingId).not.toBeNull();

    const ourProjected = projectedEvents.find((e: any) => e.childId === testChildId);
    expect(ourProjected).toBeTruthy();
    expect(ourProjected.bookingId).toBeNull();
    expect(ourProjected.type).toBe("class");
  });

  it("scopes events to the signed-in user — a different account sees none of this family's events", async () => {
    const coachCookie = await getCoachCookie();
    const res = await apiFetch("/api/dashboard/schedule", { cookie: coachCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });
});
