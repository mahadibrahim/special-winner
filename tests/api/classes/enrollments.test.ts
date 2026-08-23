import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
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

/** A dedicated `class_slot_templates` row, own capacity — enrollment
 *  scenarios need tight, test-owned control over capacity, so each test
 *  creates its own rather than sharing seed-e2e-tests.ts's "Test Class
 *  Slot" fixture. */
async function createTemplate(name: string, capacity: number): Promise<string> {
  const db = getDb();
  // Materialization horizon is 8 days, so any weekday works — see the doc
  // comment on the "Test Class Slot" seed fixture.
  const weekday = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).getUTCDay();
  const [row] = await db
    .insert(classSlotTemplates)
    .values({
      organizationId,
      venueId,
      name,
      sportLabel: "Soccer",
      weekday,
      startTime: "16:00:00",
      durationMins: 55,
      capacity,
      active: true,
    })
    .returning();
  return row.id;
}

describe("POST /api/classes/enrollments", () => {
  it("enrolls a child, then 409s template_full once capacity (1) is used up", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Enroll-Cap1-${suffix}`, 1);

    const childA = await createTestChild(parentUserId, `EnrollA-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childA,
      organizationId,
      tierId,
      idSuffix: `enra-${suffix}`,
    });

    const resA = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childA }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(typeof bodyA.enrollmentId).toBe("string");

    // The new enrollment shows up in the caller's list, joined to the template.
    const listRes = await apiFetch("/api/classes/enrollments", { cookie });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const found = listBody.enrollments.find((e: any) => e.id === bodyA.enrollmentId);
    expect(found).toBeTruthy();
    expect(found.familyMemberId).toBe(childA);
    expect(found.template).toMatchObject({ id: templateId, capacity: 1 });

    const childB = await createTestChild(parentUserId, `EnrollB-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childB,
      organizationId,
      tierId,
      idSuffix: `enrb-${suffix}`,
    });
    const resB = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childB }),
    });
    expect(resB.status).toBe(409);
    const bodyB = await resB.json();
    expect(bodyB.error).toBe("template_full");
  });

  it("403s no_membership when the child has no active class-benefit membership", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Enroll-NoMember-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `NoMember-${suffix}`);

    const res = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no_membership");
  });
});

describe("PUT /api/classes/enrollments/:id", () => {
  it("atomically moves a standing enrollment to a new template", async () => {
    const suffix = Date.now();
    const templateA = await createTemplate(`Move-From-${suffix}`, 5);
    const templateB = await createTemplate(`Move-To-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `Mover-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `mover-${suffix}`,
    });

    const createRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateA, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();

    const putRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: templateB }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.ok).toBe(true);
    const newEnrollmentId = putBody.enrollmentId as string;
    expect(newEnrollmentId).not.toBe(enrollmentId);

    const db = getDb();
    const [oldRow] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId));
    expect(oldRow.status).toBe("ended");
    expect(oldRow.endedAt).not.toBeNull();

    const [newRow] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, newEnrollmentId));
    expect(newRow.status).toBe("active");
    expect(newRow.slotTemplateId).toBe(templateB);
    expect(newRow.familyMemberId).toBe(childId);
    // The membership carries over untouched — the move doesn't re-check or
    // re-grant the benefit, it's the same standing seat under a new template.
    expect(newRow.membershipId).toBe(oldRow.membershipId);
  });
});

describe("DELETE /api/classes/enrollments/:id", () => {
  it("ends a standing enrollment", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Delete-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `Deleter-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `deleter-${suffix}`,
    });

    const createRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();

    const deleteRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "DELETE",
      cookie,
    });
    expect(deleteRes.status).toBe(200);

    const db = getDb();
    const [row] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId));
    expect(row.status).toBe("ended");

    // A second delete is a 409 not-active, not a silent no-op 200.
    const secondDeleteRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "DELETE",
      cookie,
    });
    expect(secondDeleteRes.status).toBe(409);
  });
});
