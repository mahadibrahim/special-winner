/**
 * Admin class-slot-template technical flag — Task 3 of the class-pricing
 * technical band (2026-09-03-class-pricing-technical-band).
 *
 * Mirrors tests/api/admin-class-packs.test.ts's shape: a standalone admin
 * signin block (not tests/api/setup/test-helpers's getAdminCookie, to match
 * that sibling file's convention) plus `resolveClassTestFixtures` for
 * org/venue resolution (tests/utils/classes-helpers.ts — shared across
 * every tests/api/classes/* and tests/api/admin-class-*.test.ts suite).
 *
 * Only asserts the contract this task produces: `isTechnical` round-trips
 * through POST create and GET list. Full CRUD/roster/notify coverage for
 * templates already lives in tests/api/classes/admin-templates.test.ts.
 *
 * Also covers the final-review fix wave's F3: an `isTechnical` flip is
 * blocked (409 `technical_flip_blocked`) while the template has an active
 * enrollment, allowed once that enrollment ends, and a no-op PUT (flag
 * unchanged) is never blocked regardless of enrollment state.
 *
 * Self-cleaning: the template this file creates is named with the "Admin-"
 * prefix (see TEST_TEMPLATE_NAME_PREFIXES in classes-helpers.ts) and is
 * hard-deleted in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
} from "../utils/classes-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];

async function adminCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.aspiresports.com", password: "TestAdmin123!" }),
  });
  if (!res.ok) throw new Error(`signin failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  cookie = await adminCookie();
});

afterAll(async () => {
  if (createdEnrollmentIds.length > 0) {
    const db = getDb();
    // Hard-delete, not just end: the templates below are HARD-deleted too
    // (this file's existing convention), and a `restrict` FK from
    // class_enrollments → class_slot_templates blocks that delete even for
    // an "ended" enrollment row — only removing the row entirely clears it.
    await db.delete(classEnrollments).where(inArray(classEnrollments.id, createdEnrollmentIds));
  }
  if (createdTemplateIds.length > 0) {
    const db = getDb();
    for (const id of createdTemplateIds) {
      await db.delete(classSlotTemplates).where(eq(classSlotTemplates.id, id));
    }
  }
});

describe("admin class templates — technical flag", () => {
  it("round-trips isTechnical through create and list", async () => {
    const created = await adminFetch("/api/admin/classes/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `Admin-Tech-Test-${Date.now()}`,
        venueId,
        weekday: 2,
        startTime: "16:00",
        capacity: 10,
        sessionRateDollars: 37,
        isTechnical: true,
      }),
    });
    expect(created.status).toBe(201);
    const { template } = await created.json();
    createdTemplateIds.push(template.id);
    expect(template.isTechnical).toBe(true);

    const list = await adminFetch("/api/admin/classes/templates");
    expect(list.status).toBe(200);
    const row = (await list.json()).templates.find((t: any) => t.id === template.id);
    expect(row).toBeTruthy();
    expect(row.isTechnical).toBe(true);
  });

  it("defaults isTechnical to false when omitted", async () => {
    const created = await adminFetch("/api/admin/classes/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `Admin-Tech-Default-${Date.now()}`,
        venueId,
        weekday: 3,
        startTime: "17:00",
        capacity: 8,
      }),
    });
    expect(created.status).toBe(201);
    const { template } = await created.json();
    createdTemplateIds.push(template.id);
    expect(template.isTechnical).toBe(false);
  });

  it("round-trips isTechnical: true through an update (PUT)", async () => {
    const created = await adminFetch("/api/admin/classes/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `Admin-Tech-Update-${Date.now()}`,
        venueId,
        weekday: 4,
        startTime: "15:00",
        capacity: 6,
      }),
    });
    expect(created.status).toBe(201);
    const template = (await created.json()).template;
    createdTemplateIds.push(template.id);
    expect(template.isTechnical).toBe(false);

    const updated = await adminFetch(`/api/admin/classes/templates/${template.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: template.name,
        venueId,
        weekday: 4,
        startTime: "15:00",
        capacity: 6,
        active: true,
        isTechnical: true,
      }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).template.isTechnical).toBe(true);
  });

  it("blocks an isTechnical flip while the template has an active enrollment, allows it once ended (F3)", async () => {
    const suffix = Date.now();
    const created = await adminFetch("/api/admin/classes/templates", {
      method: "POST",
      body: JSON.stringify({
        name: `Admin-Tech-Flip-${suffix}`,
        venueId,
        weekday: 5,
        startTime: "14:00",
        capacity: 8,
        sessionRateDollars: 35,
        isTechnical: false,
      }),
    });
    expect(created.status).toBe(201);
    const template = (await created.json()).template;
    createdTemplateIds.push(template.id);

    const childId = await createTestChild(parentUserId, `TechFlip-${suffix}`);
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `techflip-${suffix}`,
    });
    const db = getDb();
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({
        slotTemplateId: template.id,
        familyMemberId: childId,
        membershipId,
        status: "active",
      })
      .returning({ id: classEnrollments.id });
    createdEnrollmentIds.push(enrollment.id);

    const blockedFlip = await adminFetch(`/api/admin/classes/templates/${template.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: template.name,
        venueId,
        weekday: 5,
        startTime: "14:00",
        capacity: 8,
        active: true,
        isTechnical: true,
      }),
    });
    expect(blockedFlip.status).toBe(409);
    const blockedBody = await blockedFlip.json();
    expect(blockedBody.error).toBe("technical_flip_blocked");

    // A no-op PUT (isTechnical unchanged) must NOT be blocked by the guard —
    // only an actual flip while enrollments are active is rejected.
    const noopUpdate = await adminFetch(`/api/admin/classes/templates/${template.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: template.name,
        venueId,
        weekday: 5,
        startTime: "14:00",
        capacity: 8,
        active: true,
        isTechnical: false,
      }),
    });
    expect(noopUpdate.status).toBe(200);

    // End the enrollment — the flip should now be allowed.
    await db
      .update(classEnrollments)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(classEnrollments.id, enrollment.id));

    const allowedFlip = await adminFetch(`/api/admin/classes/templates/${template.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: template.name,
        venueId,
        weekday: 5,
        startTime: "14:00",
        capacity: 8,
        active: true,
        isTechnical: true,
      }),
    });
    expect(allowedFlip.status).toBe(200);
    expect((await allowedFlip.json()).template.isTechnical).toBe(true);
  });
});
