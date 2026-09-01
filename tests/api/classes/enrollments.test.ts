import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classEnrollments } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;

// Every template / enrollment this file creates, so afterAll can retire
// them — materializeClassSessions sweeps EVERY active template on EVERY
// cron invocation, so leaked fixtures directly slow down (and add noise
// to) the cron this suite tests. See cleanupTestClassFixtures's doc comment.
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
/** Every drop_in_sessions row this file materializes, cancelled in afterAll so
 *  none of them linger as a later run's "earliest upcoming scheduled session"
 *  (same rationale as class-block-purchase.test.ts's identical list). */
const createdSessionIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  // One-time hygiene for orphans from before this cleanup existed (or a
  // crashed prior run) — safe here because tests/api runs with
  // fileParallelism:false, so no sibling file is creating fixtures
  // concurrently.
  await sweepOrphanedTestTemplates(organizationId);
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
});

/** A dedicated `class_slot_templates` row, own capacity — enrollment
 *  scenarios need tight, test-owned control over capacity, so each test
 *  creates its own rather than sharing seed-e2e-tests.ts's "Test Class
 *  Slot" fixture. Tracks the id for afterAll cleanup. */
async function createTemplate(
  name: string,
  capacity: number,
  opts: { active?: boolean; minAge?: number; maxAge?: number } = {},
): Promise<string> {
  const id = await createTestClassTemplate({
    organizationId,
    venueId,
    name,
    capacity,
    active: opts.active,
    minAge: opts.minAge,
    maxAge: opts.maxAge,
  });
  createdTemplateIds.push(id);
  return id;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

/** A `kind='class'` drop_in_sessions row pinned to a class-slot template —
 *  the shape the materialization cron produces. */
async function createClassSession(startsAt: Date, slotTemplateId: string): Promise<string> {
  const db = getDb();
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
    memberRateCents: 999,
  });
  await db
    .update(dropInSessions)
    .set({ classSlotTemplateId: slotTemplateId })
    .where(eq(dropInSessions.id, ctx.sessionId));
  createdSessionIds.push(ctx.sessionId);
  return ctx.sessionId;
}

/** A `YYYY-MM-DD` birth date for a child who is exactly `age` years old
 *  today, whatever "today" is — a Jan 1 birthday `age` years back is already
 *  past on every day of the current year, so the age math is stable and this
 *  test can't rot into a different age next January. */
function birthDateForAge(age: number): string {
  return `${new Date().getUTCFullYear() - age}-01-01`;
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
    createdEnrollmentIds.push(bodyA.enrollmentId);

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

  it("400s template_inactive when the template has been retired", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Enroll-Inactive-${suffix}`, 5, { active: false });
    const childId = await createTestChild(parentUserId, `InactiveTarget-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `inactive-${suffix}`,
    });

    const res = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("template_inactive");
  });

  it("422s age_ineligible for a child outside the template's age range, and lets an in-range sibling through", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Enroll-AgeGate-${suffix}`, 5, {
      minAge: 4,
      maxAge: 6,
    });

    // Too old: 12 vs. maxAge 6. Without the gate this enrollment would be
    // accepted and then fail age_ineligible inside the materialization cron
    // every single week, forever.
    const oldChild = await createTestChild(
      parentUserId,
      `AgeTooOld-${suffix}`,
      birthDateForAge(12),
    );
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: oldChild,
      organizationId,
      tierId,
      idSuffix: `ageold-${suffix}`,
    });

    const tooOldRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: oldChild }),
    });
    expect(tooOldRes.status).toBe(422);
    expect((await tooOldRes.json()).error).toBe("age_ineligible");

    // In range (5, between 4 and 6) — the gate must not over-block.
    const okChild = await createTestChild(
      parentUserId,
      `AgeInRange-${suffix}`,
      birthDateForAge(5),
    );
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: okChild,
      organizationId,
      tierId,
      idSuffix: `ageok-${suffix}`,
    });

    const okRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: okChild }),
    });
    expect(okRes.status).toBe(200);
    createdEnrollmentIds.push((await okRes.json()).enrollmentId);
  });

  it("409s already_enrolled when the child enrolls in the same template twice", async () => {
    const suffix = Date.now();
    const templateId = await createTemplate(`Enroll-Twice-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `TwiceEnroller-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `twice-${suffix}`,
    });

    const firstRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(firstRes.status).toBe(200);
    const { enrollmentId } = await firstRes.json();
    createdEnrollmentIds.push(enrollmentId);

    const secondRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(secondRes.status).toBe(409);
    const body = await secondRes.json();
    expect(body.error).toBe("already_enrolled");
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
    createdEnrollmentIds.push(enrollmentId);

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
    createdEnrollmentIds.push(newEnrollmentId);

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

  it("404s enrollment_not_found when changing the slot of an already-ended enrollment", async () => {
    const suffix = Date.now();
    const templateA = await createTemplate(`Move-EndedFrom-${suffix}`, 5);
    const templateB = await createTemplate(`Move-EndedTo-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `EndedMover-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `endedmover-${suffix}`,
    });

    const createRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateA, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();
    createdEnrollmentIds.push(enrollmentId);

    const deleteRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "DELETE",
      cookie,
    });
    expect(deleteRes.status).toBe(200);

    // Ownership check passes (the row still exists, just ended) — the
    // changeEnrollmentSlot library call is what must report the not-active
    // row as enrollment_not_found.
    const putRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: templateB }),
    });
    expect(putRes.status).toBe(404);
    const body = await putRes.json();
    expect(body.error).toBe("enrollment_not_found");
  });

  it("422s age_ineligible when the destination template's age range excludes the child", async () => {
    const suffix = Date.now();
    const templateFrom = await createTemplate(`Move-AgeFrom-${suffix}`, 5);
    const templateTo = await createTemplate(`Move-AgeTo-${suffix}`, 5, { minAge: 10 });

    const childId = await createTestChild(
      parentUserId,
      `AgeMover-${suffix}`,
      birthDateForAge(5),
    );
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `agemover-${suffix}`,
    });

    const createRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateFrom, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();
    createdEnrollmentIds.push(enrollmentId);

    const putRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: templateTo }),
    });
    expect(putRes.status).toBe(422);
    expect((await putRes.json()).error).toBe("age_ineligible");

    // Atomic failure — the child keeps their original seat.
    const db = getDb();
    const [row] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId));
    expect(row.status).toBe("active");
    expect(row.slotTemplateId).toBe(templateFrom);
  });

  it("409s template_full when the destination template is full", async () => {
    const suffix = Date.now();
    const templateFrom = await createTemplate(`Move-DestFull-From-${suffix}`, 5);
    const templateFull = await createTemplate(`Move-DestFull-To-${suffix}`, 1);

    // Fill the destination template with a different child first.
    const fillerChild = await createTestChild(parentUserId, `DestFullFiller-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: fillerChild,
      organizationId,
      tierId,
      idSuffix: `destfullfiller-${suffix}`,
    });
    const fillerRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateFull, familyMemberId: fillerChild }),
    });
    expect(fillerRes.status).toBe(200);
    const { enrollmentId: fillerEnrollmentId } = await fillerRes.json();
    createdEnrollmentIds.push(fillerEnrollmentId);

    // The mover starts on a different (non-full) template.
    const moverChild = await createTestChild(parentUserId, `DestFullMover-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: moverChild,
      organizationId,
      tierId,
      idSuffix: `destfullmover-${suffix}`,
    });
    const moverRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateFrom, familyMemberId: moverChild }),
    });
    expect(moverRes.status).toBe(200);
    const { enrollmentId: moverEnrollmentId } = await moverRes.json();
    createdEnrollmentIds.push(moverEnrollmentId);

    const putRes = await apiFetch(`/api/classes/enrollments/${moverEnrollmentId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: templateFull }),
    });
    expect(putRes.status).toBe(409);
    const body = await putRes.json();
    expect(body.error).toBe("template_full");

    // The mover's original enrollment must be untouched (atomic failure).
    const db = getDb();
    const [moverRow] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, moverEnrollmentId));
    expect(moverRow.status).toBe("active");
    expect(moverRow.slotTemplateId).toBe(templateFrom);
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
    createdEnrollmentIds.push(enrollmentId);

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

  it("releases the child's future $0 seats, reports no floated credits, and promotes the waitlist", async () => {
    // A MEMBERSHIP-backed end has the same leak a slot change does: the
    // materialize cron books up to HORIZON_DAYS ahead, so quitting leaves
    // already-booked future sessions burning an allotment unit on a class
    // nobody will attend — and holding a seat a waitlisted family wants.
    // There is no grant behind this enrollment, so the float fields report
    // the honest zero rather than being omitted.
    const db = getDb();
    const suffix = Date.now();
    const templateId = await createTemplate(`Delete-Release-${suffix}`, 5);
    const childId = await createTestChild(parentUserId, `Releaser-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `releaser-${suffix}`,
    });

    const createRes = await apiFetch("/api/classes/enrollments", {
      method: "POST",
      cookie,
      body: JSON.stringify({ slotTemplateId: templateId, familyMemberId: childId }),
    });
    expect(createRes.status).toBe(200);
    const { enrollmentId } = await createRes.json();
    createdEnrollmentIds.push(enrollmentId);

    // The auto-booked future seat the cron would have left behind…
    const futureSessionId = await createClassSession(hoursFromNow(72), templateId);
    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: futureSessionId,
        userId: parentUserId,
        familyMemberId: childId,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
      })
      .returning({ id: dropInBookings.id });

    // …and a sibling waiting for exactly that seat.
    const waitlistChildId = await createTestChild(parentUserId, `ReleaseWaiter-${suffix}`);
    const [waitlisted] = await db
      .insert(dropInBookings)
      .values({
        sessionId: futureSessionId,
        userId: parentUserId,
        familyMemberId: waitlistChildId,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
      })
      .returning({ id: dropInBookings.id });

    // A PAST $0 seat on the same slot: already attended, never rewritten.
    const pastSessionId = await createClassSession(hoursFromNow(-72), templateId);
    const [pastBooking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: pastSessionId,
        userId: parentUserId,
        familyMemberId: childId,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
      })
      .returning({ id: dropInBookings.id });

    const deleteRes = await apiFetch(`/api/classes/enrollments/${enrollmentId}`, {
      method: "DELETE",
      cookie,
    });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toMatchObject({
      ok: true,
      creditsFloated: 0,
      creditsExpireAt: null,
    });

    const [after] = await db
      .select({
        status: dropInBookings.status,
        cancelledAt: dropInBookings.cancelledAt,
        cancellationReason: dropInBookings.cancellationReason,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(after.status).toBe("cancelled");
    expect(after.cancelledAt).not.toBeNull();
    expect(after.cancellationReason).toBe("user_request");

    const [pastAfter] = await db
      .select({ status: dropInBookings.status })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, pastBooking.id));
    expect(pastAfter.status).toBe("confirmed");

    // Post-commit promotion, the same best-effort loop the slot change runs.
    const [promoted] = await db
      .select({ status: dropInBookings.status, promotionToken: dropInBookings.promotionToken })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, waitlisted.id));
    expect(promoted.status).toBe("pending_claim");
    expect(promoted.promotionToken).not.toBeNull();
  });
});
