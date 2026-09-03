/**
 * Technical-training enrollment gate + Stripe add-on quantity sync — Task 5
 * of the class-pricing technical band (2026-09-03-class-pricing-technical-band).
 *
 * Mirrors tests/api/classes/enrollments.test.ts's harness (apiFetch/getAuthCookie
 * + tests/utils/classes-helpers.ts fixtures) for the parent-side enrollment
 * calls, and tests/api/admin-class-templates-technical.test.ts's standalone
 * admin signin block for provisioning the technical template + tier through
 * the admin APIs (Task 3 / Task 4), since only those endpoints can set
 * `isTechnical` / `technicalMonthlyDollars`.
 *
 * Stripe-less-safe: the gate fires before any Stripe call (pure DB read +
 * `requiresTechnicalPremium`), and `syncTechnicalAddonQuantity` is
 * fire-and-forget — the membership row here is seeded directly with a fake
 * `stripeSubscriptionId` (same shorthand as createTestChildMembership /
 * memberships-child-subscribe.test.ts's "AlreadyMemberChild"), so the sync's
 * Stripe calls 404 against a real Stripe API and are swallowed by its
 * try/catch. No assertion here depends on the sync actually reaching Stripe.
 *
 * Self-cleaning: the tier and templates this file creates are named with
 * unique run-scoped suffixes and torn down in afterAll (tier deactivated,
 * templates deactivated via cleanupTestClassFixtures, enrollments ended).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { classEnrollments } from "@/lib/db/schema/classes";
import { consents } from "@/lib/db/schema/consents";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../utils/classes-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";
const TECHNICAL_MONTHLY_CENTS = 900; // $9/mo, matches the brief's fixture.

let organizationId: string;
let venueId: string;
let parentUserId: string;
let parentCookie: string;
let adminCookie: string;

let techTierId: string;
let techTemplateId: string;
let standardTemplateId: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdTierIds: string[] = [];
/** Materialized `drop_in_sessions` rows the booking-gate suite (below)
 *  creates directly — cancelled in afterAll so none linger as the
 *  "earliest upcoming scheduled session" for a later run (same convention
 *  as classes-credit-booking.test.ts). */
const createdSessionIds: string[] = [];
/** Children the booking-gate suite books through `/api/classes/book` with a
 *  fresh `CLASS_TEST_WAIVER` signature — that writes a canonical annual
 *  `consents` row (src/lib/consents/liability.ts), which must not outlive
 *  this run (365-day window, org-scoped). */
const createdWaiverChildIds: string[] = [];

async function adminSignin(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.aspiresports.com", password: "TestAdmin123!" }),
  });
  if (!res.ok) throw new Error(`admin signin failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  parentCookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  adminCookie = await adminSignin();

  const suffix = Date.now();

  // A dedicated tier with a configured technical supplement and a LIMITED
  // (non-unlimited) class benefit — requiresTechnicalPremium only fires when
  // both hold. Created via the admin tier endpoint (Task 4) so
  // technicalMonthlyDollars actually round-trips to technicalMonthlyCents.
  const tierRes = await adminFetch("/api/admin/memberships/tiers", {
    method: "POST",
    body: JSON.stringify({
      name: `Technical-Test-Tier-${suffix}`,
      monthlyDollars: 49,
      annualDollars: null,
      benefits: { classes_per_month: 4 },
      technicalMonthlyDollars: 9,
      isActive: true,
    }),
  });
  if (tierRes.status !== 201) {
    throw new Error(
      `tier fixture creation failed: ${tierRes.status} ${await tierRes.text()}`,
    );
  }
  const { tier } = await tierRes.json();
  techTierId = tier.id;
  createdTierIds.push(techTierId);
  expect(tier.technicalMonthlyCents).toBe(TECHNICAL_MONTHLY_CENTS);

  // The technical slot template — created via the admin template endpoint
  // (Task 3) so isTechnical round-trips.
  const templateRes = await adminFetch("/api/admin/classes/templates", {
    method: "POST",
    body: JSON.stringify({
      name: `Tech-Enroll-Test-${suffix}`,
      venueId,
      weekday: 2,
      startTime: "16:00",
      capacity: 10,
      sessionRateDollars: 37,
      isTechnical: true,
    }),
  });
  if (templateRes.status !== 201) {
    throw new Error(
      `technical template fixture creation failed: ${templateRes.status} ${await templateRes.text()}`,
    );
  }
  techTemplateId = (await templateRes.json()).template.id;
  createdTemplateIds.push(techTemplateId);

  // A plain (non-technical) template for the "standard slots are unaffected"
  // case — the direct-insert helper is fine here since isTechnical just
  // needs to stay at its default false.
  standardTemplateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `Enroll-Standard-Test-${suffix}`,
    capacity: 10,
  });
  createdTemplateIds.push(standardTemplateId);
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
  if (createdTierIds.length > 0) {
    const db = getDb();
    for (const id of createdTierIds) {
      await db.update(membershipTiers).set({ isActive: false }).where(eq(membershipTiers.id, id));
    }
  }
  if (createdSessionIds.length > 0) {
    const db = getDb();
    await db
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  }
  if (createdWaiverChildIds.length > 0) {
    const db = getDb();
    await db.delete(consents).where(inArray(consents.familyMemberId, createdWaiverChildIds));
  }
});

async function parentFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, { ...init, cookie: parentCookie });
}

describe("technical enrollment gate", () => {
  it("refuses technical enrollment without acknowledgement", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechGate-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techgate-${suffix}`,
    });

    const res = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({ slotTemplateId: techTemplateId, familyMemberId: childId }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("technical_premium_required");
    expect(body.technicalMonthlyCents).toBe(TECHNICAL_MONTHLY_CENTS);
  });

  it("enrolls with acknowledgement", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechAck-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techack-${suffix}`,
    });

    const res = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({
        slotTemplateId: techTemplateId,
        familyMemberId: childId,
        acknowledgeTechnicalPremium: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.enrollmentId).toBe("string");
    createdEnrollmentIds.push(body.enrollmentId);
  });

  it("standard slots are unaffected", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechStandard-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techstandard-${suffix}`,
    });

    const res = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({ slotTemplateId: standardTemplateId, familyMemberId: childId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    createdEnrollmentIds.push(body.enrollmentId);
  });
});

describe("technical gate on changeEnrollmentSlot (PUT)", () => {
  it("gates a standard->technical move without acknowledgement, then allows it with ack", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechMove-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techmove-${suffix}`,
    });

    const createRes = await parentFetch("/api/classes/enrollments", {
      method: "POST",
      body: JSON.stringify({ slotTemplateId: standardTemplateId, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();
    createdEnrollmentIds.push(enrollmentId);

    const blockedRes = await parentFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "PUT",
      body: JSON.stringify({ newSlotTemplateId: techTemplateId }),
    });
    expect(blockedRes.status).toBe(409);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error).toBe("technical_premium_required");
    expect(blockedBody.technicalMonthlyCents).toBe(TECHNICAL_MONTHLY_CENTS);

    // The original enrollment must still be untouched — a rejected gate
    // must not have ended the old seat.
    const stillActiveRes = await parentFetch("/api/classes/enrollments", { method: "GET" });
    expect(stillActiveRes.status).toBe(200);
    const stillActiveBody = await stillActiveRes.json();
    expect(
      stillActiveBody.enrollments.some((e: any) => e.id === enrollmentId),
    ).toBe(true);

    const ackRes = await parentFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "PUT",
      body: JSON.stringify({ newSlotTemplateId: techTemplateId, acknowledgeTechnicalPremium: true }),
    });
    expect(ackRes.status).toBe(200);
    const ackBody = await ackRes.json();
    createdEnrollmentIds.push(ackBody.enrollmentId);
  });
});

/**
 * Task 6 — the booking gate that closes the leak this suite's name
 * describes: a member's monthly allotment must not book a technical slot
 * for free unless the child is actually entitled to the add-on (an active
 * enrollment on a technical template backed by the SAME membership, or an
 * unlimited tier — requiresTechnicalPremium covers the latter on its own).
 *
 * A materialized `drop_in_sessions` row pinned to `techTemplateId` stands in
 * for the cron's real materialization (same shorthand as
 * classes-credit-booking.test.ts's `createClassSession`) — no need to wait
 * on `materializeClassSessions` for a booking-gate test.
 */
describe("booking gate on member allotment (POST /api/classes/book)", () => {
  /** A `kind='class'` session pinned to a template, for booking. Tracked in
   *  `createdSessionIds` for afterAll cleanup. */
  async function createClassSession(slotTemplateId: string): Promise<string> {
    const db = getDb();
    const { sessionId } = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
      capacity: 10,
      startsAt: new Date(Date.now() + 6 * 86_400_000),
      memberRateCents: 999,
    });
    await db
      .update(dropInSessions)
      .set({ classSlotTemplateId: slotTemplateId })
      .where(eq(dropInSessions.id, sessionId));
    createdSessionIds.push(sessionId);
    return sessionId;
  }

  it("does not let the allotment book a technical slot without a technical entitlement", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechBookGate-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techbookgate-${suffix}`,
    });
    const sessionId = await createClassSession(techTemplateId);
    createdWaiverChildIds.push(childId);

    const res = await parentFetch("/api/classes/book", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("technical_not_included");

    // The seat must NOT have been granted from the allotment (or at all) —
    // no booking row of any kind for this child/session.
    const db = getDb();
    const rows = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(eq(dropInBookings.sessionId, sessionId), eq(dropInBookings.familyMemberId, childId)),
      );
    expect(rows.length).toBe(0);
  });

  it("books off the allotment once the child holds an active technical enrollment on the same membership", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechBookEntitled-${suffix}`);
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techbookentitled-${suffix}`,
    });

    // Entitlement, per the brief's decision: ANY active enrollment on a
    // technical template backed by this same membership. Direct insert
    // (rather than driving /api/classes/enrollments) since this suite's
    // earlier tests already cover that endpoint's own gate — this test is
    // about the DOWNSTREAM booking gate reading the entitlement correctly.
    const db = getDb();
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({
        slotTemplateId: techTemplateId,
        familyMemberId: childId,
        membershipId,
        status: "active",
      })
      .returning({ id: classEnrollments.id });
    createdEnrollmentIds.push(enrollment.id);

    const sessionId = await createClassSession(techTemplateId);
    createdWaiverChildIds.push(childId);

    const res = await parentFetch("/api/classes/book", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe("member_allotment");
  });

  it("standard slots book off the allotment unaffected by the technical gate", async () => {
    const suffix = Date.now();
    const childId = await createTestChild(parentUserId, `TechBookStandard-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId: techTierId,
      idSuffix: `techbookstandard-${suffix}`,
    });
    const sessionId = await createClassSession(standardTemplateId);
    createdWaiverChildIds.push(childId);

    const res = await parentFetch("/api/classes/book", {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe("member_allotment");
  });
});
