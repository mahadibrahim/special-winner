import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { roles, userRoles } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
  sweepOrphanedTestMembershipTiers,
  cleanupTestMembershipTiers,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../../utils/classes-helpers";
import { classEnrollments } from "@/lib/db/schema/classes";
import { setCoachesFor, getCoachesFor } from "@/lib/coach/coaching-assignments";

const CRON_SECRET = process.env.CRON_SECRET;

let organizationId: string;
let venueId: string;
let parentUserId: string;
let cookie: string;

// Every template / enrollment / membership tier this file creates, so
// afterAll can retire them. This matters MORE here than in the other
// suites: an orphaned template isn't just dead weight, it's a template
// `materializeClassSessions` keeps sweeping (and re-attempting bookings
// against) on EVERY future cron invocation, directly slowing down the exact
// endpoint this file tests. An orphaned tier is worse still — it's a live
// `classes_per_month` row that stays indistinguishable from a real class
// membership tier on `/api/public/membership-tiers` forever.
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
const createdTierIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  // One-time hygiene for orphans from before this cleanup existed — safe
  // here since tests/api runs with fileParallelism:false.
  await sweepOrphanedTestTemplates(organizationId);
  await sweepOrphanedTestMembershipTiers(organizationId);
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
  await cleanupTestMembershipTiers(createdTierIds);
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
      createdTierIds.push(tier1.id);

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
      // createChildClassBooking's waiver check applies to auto-enrollment
      // bookings too, and the cron never supplies one (see materialize.ts's
      // module doc comment — no waiver prompt on this path). In real usage a
      // child only gets auto-enrolled after a waiver-establishing booking;
      // simulate that here with a throwaway TRIAL booking (so it doesn't
      // consume the member allotment being tested).
      //
      // The signature FIELDS matter, not just the flag: the gate is now the
      // annual predicate (src/lib/consents/liability.ts), which reads dated
      // SIGNATURE rows only — a row carrying `waiverSigned: true` with no
      // `waiverSignedAt` is a derived copy (which is exactly what the cron
      // itself stamps on the sessions it auto-books) and can never establish
      // validity, or every auto-booked row would renew its own waiver.
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
        waiverSignedAt: new Date(),
        waiverSignedBy: "Parent Test",
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
      for (const key of ["sessionsCreated", "autoBooked", "skippedExhausted", "skippedPastDue", "skippedNoWaiver", "enrollmentsEnded", "failed"]) {
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

  it(
    "copies the template's class rates onto every materialized session, and quotes " +
      "them (not the adult pickup rate card) on the allotment-exhausted 402",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();
      const db = getDb();
      const suffix = Date.now();

      // Same rates the Task-9 seed template carries — a class member rate
      // deliberately distinct from any plausible adult drop-in rate-card
      // default, so a fallback regression can't accidentally match.
      const templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Cron-Template-Rates-${suffix}`,
        capacity: 20,
        startTime: "13:00:00",
        sessionRateCents: 2500,
        memberRateCents: 1500,
      });
      createdTemplateIds.push(templateId);

      const res = await postCron(CRON_SECRET);
      expect(res.status).toBe(200);

      // Explicit orderBy: CI's shared DB can hold several occurrences of
      // this template inside the horizon.
      const [session] = await db
        .select()
        .from(dropInSessions)
        .where(
          and(
            eq(dropInSessions.classSlotTemplateId, templateId),
            eq(dropInSessions.status, "scheduled"),
          ),
        )
        .orderBy(asc(dropInSessions.startsAt))
        .limit(1);
      expect(session).toBeTruthy();
      expect(session.sessionRateCents).toBe(2500);
      expect(session.memberRateCents).toBe(1500);

      // A child whose allotment is already spent: a cap-1 tier plus one
      // prior confirmed member_allotment booking (cheaper than four
      // bookings against the shared cap-4 tier).
      const [tier1] = await db
        .insert(membershipTiers)
        .values({
          organizationId,
          name: `Cron Rates Tier 1 - ${suffix}`,
          monthlyPriceCents: 5000,
          benefits: { classes_per_month: 1 },
          isActive: true,
        })
        .returning();
      createdTierIds.push(tier1.id);
      const child = await createTestChild(parentUserId, `CronRates-${suffix}`);
      const membershipId = await createTestChildMembership({
        userId: parentUserId,
        familyMemberId: child,
        organizationId,
        tierId: tier1.id,
        idSuffix: `cronrates-${suffix}`,
      });
      const priorCtx = await createTestDropInSession({ organizationId, venueId, kind: "class" });
      await db.insert(dropInBookings).values({
        sessionId: priorCtx.sessionId,
        userId: parentUserId,
        familyMemberId: child,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "member_allotment",
        amountPaidCents: 0,
        membershipId,
        waiverSigned: true,
      });

      const bookRes = await apiFetch("/api/classes/book", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: child,
          kind: "member",
        }),
      });
      expect(bookRes.status).toBe(402);
      const body = await bookRes.json();
      expect(body.error).toBe("allotment_exhausted");
      // The exact cents seeded on the TEMPLATE — the paid make-up the
      // client is about to be routed to is priced as a class, not as an
      // adult drop-in.
      expect(body.memberRateCents).toBe(1500);
    },
  );

  it(
    "propagates a template's active coach assignments onto every freshly-materialized " +
      "session, and never leaves one unstaffed while its template has an active set " +
      "(F1/F2 fix-round coverage, Task 3)",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();
      const db = getDb();
      const suffix = Date.now();

      const templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Cron-Template-Staffing-${suffix}`,
        capacity: 10,
        startTime: "14:00:00",
      });
      createdTemplateIds.push(templateId);

      // Two org-scoped `coach`-role users, resolved dynamically (same
      // fixtures tests/api/coaching/staffing.test.ts uses) rather than
      // hardcoded — coach@test.aspiresports.com and
      // training+coach@test.aspiresports.com are both seeded at
      // scopeType:"organization" for this org (seed-e2e-tests.ts).
      const coachRows = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(roles.name, "coach"),
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, organizationId),
          ),
        )
        .orderBy(asc(userRoles.createdAt));
      if (coachRows.length < 2) {
        throw new Error(
          `cron-materialize.test: expected at least 2 org-scoped coach-role users, found ${coachRows.length} — run npm run db:seed:e2e first`,
        );
      }
      const [leadCoachId, assistantCoachId] = coachRows.map((r) => r.userId);

      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: leadCoachId,
        assistants: [assistantCoachId],
        createdByUserId: leadCoachId,
      });

      // ---- Run 1: materialize ----
      const res1 = await postCron(CRON_SECRET);
      expect(res1.status).toBe(200);

      const sessions = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(
          and(eq(dropInSessions.classSlotTemplateId, templateId), eq(dropInSessions.status, "scheduled")),
        );
      expect(sessions.length).toBeGreaterThanOrEqual(1);
      const sessionIds = sessions.map((s) => s.id);

      // The atomicity contract from the F1 fix (materialize.ts wraps the
      // session INSERT and the coach-copy in one transaction) can't be
      // exercised with real fault injection from an HTTP-level test — there
      // is no hook to make the copy throw mid-transaction on a live cron
      // request without a test-only seam this codebase doesn't have. What
      // CAN be verified black-box is the invariant the transaction
      // guarantees: given the template had an active coach set BEFORE
      // materialization, every session that transaction produced must carry
      // that set — never zero assignment rows. If the insert-then-copy pair
      // could partially commit (the bug F1 fixed), this is exactly the
      // assertion that would go red — a session created but a copy that
      // silently failed.
      for (const sessionId of sessionIds) {
        const coaches = await getCoachesFor("class_session", sessionId);
        expect(coaches.length).toBeGreaterThan(0); // the invariant, spelled out
        expect(coaches).toHaveLength(2);
        const byId = new Map(coaches.map((c) => [c.coachUserId, c.role]));
        expect(byId.get(leadCoachId)).toBe("lead");
        expect(byId.get(assistantCoachId)).toBe("assistant");
      }

      // ---- Run 2: idempotent — no duplicate assignment rows ----
      const res2 = await postCron(CRON_SECRET);
      expect(res2.status).toBe(200);
      for (const sessionId of sessionIds) {
        const coaches = await getCoachesFor("class_session", sessionId);
        expect(coaches).toHaveLength(2);
      }

      // This suite's templates are only DEACTIVATED by cleanupTestClassFixtures
      // (afterAll), never deleted — clean up the assignment rows this test
      // created directly so they don't linger as unrelated debris.
      await db
        .delete(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId)));
      if (sessionIds.length > 0) {
        await db
          .delete(coachingAssignments)
          .where(
            and(eq(coachingAssignments.kind, "class_session"), inArray(coachingAssignments.targetId, sessionIds)),
          );
      }
    },
  );
});
