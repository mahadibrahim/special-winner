import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { apiFetch } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";
import { classEnrollments } from "@/lib/db/schema/classes";

const CRON_SECRET = process.env.CRON_SECRET;

let organizationId: string;
let venueId: string;
let parentUserId: string;

// Every template / enrollment this file creates, so afterAll can retire
// them. This matters MORE here than in the other suites: an orphaned
// template isn't just dead weight, it's a template `materializeClassSessions`
// keeps sweeping (and re-attempting bookings against) on EVERY future cron
// invocation, directly slowing down the exact endpoint this file tests.
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  // One-time hygiene for orphans from before this cleanup existed — safe
  // here since tests/api runs with fileParallelism:false.
  await sweepOrphanedTestTemplates(organizationId);
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
});

async function postCron(secret: string) {
  return apiFetch("/api/cron/materialize-class-sessions", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
}

describe("POST /api/cron/materialize-class-sessions", () => {
  it("rejects a wrong cron secret (401)", async (ctx) => {
    if (!CRON_SECRET) return ctx.skip();
    const res = await postCron("definitely-not-the-secret");
    expect(res.status).toBe(401);
  });

  it(
    "materializes sessions, auto-books an enrolled child, skips an exhausted one, " +
      "and is idempotent on a second run",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();
      const db = getDb();
      const suffix = Date.now();

      // A dedicated template so this test's assertions stay scoped away
      // from whatever other active templates exist on shared staging.
      const templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Cron-Template-${suffix}`,
        capacity: 20,
        startTime: "12:00:00",
      });
      createdTemplateIds.push(templateId);

      // A dedicated tier (classes_per_month: 1) so the "exhausted" child
      // only needs ONE prior booking to already be at cap — cheaper than
      // reusing the shared "Test Class Tier 4" (cap 4).
      const [tier1] = await db
        .insert(membershipTiers)
        .values({
          organizationId,
          name: `Cron Tier 1 - ${suffix}`,
          monthlyPriceCents: 5000,
          benefits: { classes_per_month: 1 },
          isActive: true,
        })
        .returning();

      // Enrolled child with a fresh (unused) allotment — the cron should
      // auto-book them into a materialized session.
      const okChild = await createTestChild(parentUserId, `CronOk-${suffix}`);
      const okMembershipId = await createTestChildMembership({
        userId: parentUserId,
        familyMemberId: okChild,
        organizationId,
        tierId: tier1.id,
        idSuffix: `cronok-${suffix}`,
      });
      // createChildClassBooking's waiver-on-file check applies to
      // auto-enrollment bookings too, and the cron never supplies one (see
      // materialize.ts's module doc comment — no waiver prompt on this
      // path). In real usage a child only gets auto-enrolled after a
      // waiver-establishing booking; simulate that here with a throwaway
      // TRIAL booking (so it doesn't consume the member allotment being
      // tested) that carries waiverSigned:true.
      const waiverCtx = await createTestDropInSession({ organizationId, venueId, kind: "class" });
      await db.insert(dropInBookings).values({
        sessionId: waiverCtx.sessionId,
        userId: parentUserId,
        familyMemberId: okChild,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "trial",
        amountPaidCents: 0,
        waiverSigned: true,
      });
      const [okEnrollment] = await db
        .insert(classEnrollments)
        .values({ slotTemplateId: templateId, familyMemberId: okChild, membershipId: okMembershipId })
        .returning();
      createdEnrollmentIds.push(okEnrollment.id);

      // Enrolled child whose allotment is ALREADY exhausted this month (one
      // prior confirmed member_allotment booking on an unrelated session) —
      // the cron must skip them without error, not fail the batch.
      const exhaustedChild = await createTestChild(parentUserId, `CronExhausted-${suffix}`);
      const exhaustedMembershipId = await createTestChildMembership({
        userId: parentUserId,
        familyMemberId: exhaustedChild,
        organizationId,
        tierId: tier1.id,
        idSuffix: `cronex-${suffix}`,
      });
      const priorCtx = await createTestDropInSession({ organizationId, venueId, kind: "class" });
      await db.insert(dropInBookings).values({
        sessionId: priorCtx.sessionId,
        userId: parentUserId,
        familyMemberId: exhaustedChild,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
        membershipId: exhaustedMembershipId,
        waiverSigned: true,
      });
      const [exhaustedEnrollment] = await db
        .insert(classEnrollments)
        .values({
          slotTemplateId: templateId,
          familyMemberId: exhaustedChild,
          membershipId: exhaustedMembershipId,
        })
        .returning();
      createdEnrollmentIds.push(exhaustedEnrollment.id);

      // ---- Run 1 ----
      const res1 = await postCron(CRON_SECRET);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      for (const key of ["sessionsCreated", "autoBooked", "skippedExhausted", "skippedPastDue", "failed"]) {
        expect(typeof body1[key]).toBe("number");
      }

      const sessionsAfterRun1 = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(eq(dropInSessions.classSlotTemplateId, templateId), eq(dropInSessions.status, "scheduled")),
        );
      expect(sessionsAfterRun1.length).toBeGreaterThanOrEqual(1);
      const sessionIds = sessionsAfterRun1.map((s) => s.id);

      const okBookings1 = await db
        .select()
        .from(dropInBookings)
        .where(and(eq(dropInBookings.familyMemberId, okChild), inArray(dropInBookings.sessionId, sessionIds)));
      expect(okBookings1.length).toBe(1);
      expect(okBookings1[0].paymentMethod).toBe("member_allotment");
      expect(okBookings1[0].source).toBe("auto_enrollment");
      expect(okBookings1[0].status).toBe("confirmed");

      const exhaustedBookings1 = await db
        .select()
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.familyMemberId, exhaustedChild),
            inArray(dropInBookings.sessionId, sessionIds),
          ),
        );
      expect(exhaustedBookings1.length).toBe(0);

      // ---- Run 2 — idempotent ----
      const res2 = await postCron(CRON_SECRET);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.sessionsCreated).toBe(0);
      expect(body2.autoBooked).toBe(0);

      const sessionsAfterRun2 = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(eq(dropInSessions.classSlotTemplateId, templateId), eq(dropInSessions.status, "scheduled")),
        );
      expect(sessionsAfterRun2.length).toBe(sessionsAfterRun1.length);

      const okBookings2 = await db
        .select()
        .from(dropInBookings)
        .where(and(eq(dropInBookings.familyMemberId, okChild), inArray(dropInBookings.sessionId, sessionIds)));
      expect(okBookings2.length).toBe(1); // unchanged — no duplicate booking

      const exhaustedBookings2 = await db
        .select()
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.familyMemberId, exhaustedChild),
            inArray(dropInBookings.sessionId, sessionIds),
          ),
        );
      expect(exhaustedBookings2.length).toBe(0);
    },
  );
});
