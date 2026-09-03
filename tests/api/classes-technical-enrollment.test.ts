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
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
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
