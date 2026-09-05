/**
 * POST /api/cron/send-development-reports (Phase 3 S6 — the repo's FIRST
 * monthly cron). Mock messaging is on for this dev server (MESSAGING_MOCK),
 * which still writes `email_logs` rows — so dedupe is fully testable here
 * even though no real email goes out.
 *
 * Two testing strategies, matched to what's calendar-dependent vs not:
 *   - The MONTHLY-subset scenarios drive the real HTTP endpoint, using
 *     whatever period `computeReportPeriod(new Date())` resolves to right
 *     now (imported directly so the fixtures and assertions always agree
 *     with the endpoint's own clock — no hardcoded "today").
 *   - The QUARTERLY-full scenario calls `runDevelopmentReports` directly
 *     with a synthetic PAST quarter (2019-Q1) rather than going through the
 *     HTTP endpoint's `computeReportPeriod(new Date())` — this exercises
 *     the exact same scan/build/send/dedupe pipeline the endpoint uses,
 *     without waiting for the calendar to actually land on a quarter-close
 *     month. See tests/unit/reports/development-reports-period.test.ts for
 *     exhaustive fixed-date coverage of WHICH branch fires when.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers, emailLogs } from "@/lib/db/schema/registrations";
import { familyMemberParents } from "@/lib/db/schema/family-member-parents";
import { playerAssessments, assessmentSnapshots, playerAchievements } from "@/lib/db/schema/assessments";
import { coachNotes } from "@/lib/db/schema/teams";
import { skills } from "@/lib/db/schema/curriculum";
import { sports } from "@/lib/db/schema/sports";
import { recomputePlayerSnapshots } from "@/lib/curriculum/snapshots";
import {
  computeReportPeriod,
  emailTypeForPeriod,
  runDevelopmentReports,
  type QuarterlyReportPeriod,
} from "@/lib/reports/development-reports";
import { createTestChild } from "../../utils/classes-helpers";
import { apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

const ENDPOINT = "/api/cron/send-development-reports";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

describe("Cron: send development reports", () => {
  let parentUserId: string;
  let coachUserId: string;
  let skillId: string;

  const createdFamilyMemberIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();

    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!parent) {
      throw new Error(
        "development-reports-cron test: seeded parent@test.aspiresports.com not found — run npm run db:seed:e2e first",
      );
    }
    parentUserId = parent.id;

    const [coach] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "coach@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!coach) throw new Error("development-reports-cron test: seeded coach not found");
    coachUserId = coach.id;

    const [skillRow] = await db
      .select({ id: skills.id })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .where(eq(sports.slug, "soccer"))
      .orderBy(asc(skills.createdAt))
      .limit(1);
    if (!skillRow) {
      throw new Error(
        "development-reports-cron test: no soccer skill found — run the curriculum loader first",
      );
    }
    skillId = skillRow.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (createdFamilyMemberIds.length > 0) {
      // email_logs rows are intentionally left behind: they're the shared
      // seeded parent's rows (used across many suites), and every row this
      // test wrote is keyed in `metadata` to a familyMemberId that gets
      // deleted below anyway — harmless orphans, same as other cron tests'
      // fixture teardown. Deleting by userId would risk clobbering
      // unrelated tests' email_logs assertions against this same shared
      // parent@test.aspiresports.com fixture.
      await db.delete(playerAssessments).where(inArray(playerAssessments.familyMemberId, createdFamilyMemberIds));
      await db.delete(assessmentSnapshots).where(inArray(assessmentSnapshots.familyMemberId, createdFamilyMemberIds));
      await db.delete(coachNotes).where(inArray(coachNotes.familyMemberId, createdFamilyMemberIds));
      await db.delete(playerAchievements).where(inArray(playerAchievements.familyMemberId, createdFamilyMemberIds));
      await db.delete(familyMemberParents).where(inArray(familyMemberParents.familyMemberId, createdFamilyMemberIds));
      await db.delete(familyMembers).where(inArray(familyMembers.id, createdFamilyMemberIds));
    }
    resetCookies();
  });

  it("rejects request without cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": "definitely-wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("GET returns description without sending", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    const json = await expectJson(res, 200);
    expect(typeof json.description).toBe("string");
    expect(json.description).toContain("development-report");
  });

  describe("monthly subset — the live cron's real just-closed period", () => {
    it("sends once per (child, guardian) for a child with an assessment this period, then skips on re-run", async () => {
      const db = getDb();
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") {
        // The live calendar happens to be on a quarter-close month right
        // now — the monthly branch isn't reachable via the real endpoint
        // today. Covered exhaustively for all months by the unit suite;
        // skip this specific live-monthly assertion rather than fail.
        return;
      }

      const familyMemberId = await createTestChild(parentUserId, `DevReportMonthly-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const assessedAt = new Date(period.start.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days into the closed month
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 3,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const emailType = emailTypeForPeriod(period);

      // Filter by metadata.familyMemberId (the actual dedupe key), not just
      // recipientEmail — the shared parent@test.aspiresports.com fixture is
      // reused across many `it()` blocks in this file, so recipientEmail
      // alone would conflate this child's rows with a sibling fixture's.
      async function logsForThisChild() {
        const rows = await db
          .select({ status: emailLogs.status, metadata: emailLogs.metadata })
          .from(emailLogs)
          .where(and(eq(emailLogs.emailType, emailType), eq(emailLogs.userId, parentUserId)));
        return rows.filter(
          (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
        );
      }

      const first = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(first, 200);

      const logsAfterFirst = await logsForThisChild();
      expect(logsAfterFirst.length).toBe(1);
      expect(logsAfterFirst[0].status === "sent" || logsAfterFirst[0].status === "skipped").toBe(true);

      const second = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(second, 200);

      const logsAfterSecond = await logsForThisChild();
      expect(logsAfterSecond.length).toBe(1);
    });

    it("a child with zero assessments/notes this period is not counted as a candidate", async () => {
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") return;

      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportNoActivity-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const dryRunRes = await apiFetch(`${ENDPOINT}?dryRun=1`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const dryRunJson = await expectJson(dryRunRes, 200);
      expect(dryRunJson.dryRun).toBe(true);
      expect(Array.isArray(dryRunJson.candidates)).toBe(true);
      const candidateIds = dryRunJson.candidates.map((c: { familyMemberId: string }) => c.familyMemberId);
      expect(candidateIds).not.toContain(familyMemberId);

      // Can't assert zero globally (shared DB), but this specific child's
      // metadata key must never appear.
      const emailType = emailTypeForPeriod(period);
      const rows = await db.select({ metadata: emailLogs.metadata }).from(emailLogs).where(eq(emailLogs.emailType, emailType));
      const taggedForThisChild = rows.some(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(taggedForThisChild).toBe(false);
    });

    it("dryRun=1 sends nothing (candidate present but no new email_logs row)", async () => {
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") return;

      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportDryRun-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const assessedAt = new Date(period.start.getTime() + 2 * 24 * 60 * 60 * 1000);
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 2,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const dryRunRes = await apiFetch(`${ENDPOINT}?dryRun=1`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const dryRunJson = await expectJson(dryRunRes, 200);
      const candidateIds = dryRunJson.candidates.map((c: { familyMemberId: string }) => c.familyMemberId);
      expect(candidateIds).toContain(familyMemberId);

      const emailType = emailTypeForPeriod(period);
      const rows = await db.select({ metadata: emailLogs.metadata }).from(emailLogs).where(eq(emailLogs.emailType, emailType));
      const taggedForThisChild = rows.some(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(taggedForThisChild, "dryRun must not have sent/logged anything").toBe(false);

      // Now run for real — proves the candidate WOULD have sent (pairs with
      // the dry run above to show dryRun genuinely changed nothing but the
      // send step).
      const liveRes = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(liveRes, 200);
      const rowsAfter = await db.select({ metadata: emailLogs.metadata }).from(emailLogs).where(eq(emailLogs.emailType, emailType));
      const taggedAfter = rowsAfter.some(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(taggedAfter).toBe(true);
    });

    it("a failed prior send is retried on the next run (anti-dedupe excludes status='failed')", async () => {
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") return;

      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportRetry-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const assessedAt = new Date(period.start.getTime() + 3 * 24 * 60 * 60 * 1000);
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 4,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const emailType = emailTypeForPeriod(period);

      // Hand-insert a FAILED log row for this exact (child, guardian, period)
      // key — simulates a prior Resend blip without needing to actually
      // break Resend. The pre-send re-check filters status != 'failed', so
      // this must not block the real send below.
      await db.insert(emailLogs).values({
        userId: parentUserId,
        emailType,
        recipientEmail: "parent@test.aspiresports.com",
        subject: "development report (staged failure)",
        status: "failed",
        metadata: { familyMemberId, parentUserId },
      });

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(res, 200);

      const rows = await db
        .select({ status: emailLogs.status, metadata: emailLogs.metadata })
        .from(emailLogs)
        .where(and(eq(emailLogs.emailType, emailType), eq(emailLogs.userId, parentUserId)));
      const forThisChild = rows.filter(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      // The failed row is still there, PLUS a new non-failed row proving
      // the retry went through.
      expect(forThisChild.some((r) => r.status === "failed")).toBe(true);
      expect(forThisChild.some((r) => r.status === "sent" || r.status === "skipped")).toBe(true);
    });

    it("multiple guardians of the same child each get their own email", async () => {
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") return;

      const db = getDb();
      const [coParent] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, "familyonly@test.aspiresports.com"))
        .orderBy(asc(users.createdAt))
        .limit(1);
      if (!coParent) {
        throw new Error("development-reports-cron test: seeded familyonly@test.aspiresports.com not found");
      }

      const familyMemberId = await createTestChild(parentUserId, `DevReportMultiGuardian-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);
      await db.insert(familyMemberParents).values({
        familyMemberId,
        parentUserId: coParent.id,
        relationship: "guardian",
      });

      const assessedAt = new Date(period.start.getTime() + 4 * 24 * 60 * 60 * 1000);
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 3,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(res, 200);

      const emailType = emailTypeForPeriod(period);
      const rows = await db
        .select({ recipientEmail: emailLogs.recipientEmail, metadata: emailLogs.metadata })
        .from(emailLogs)
        .where(eq(emailLogs.emailType, emailType));
      const forThisChild = rows.filter(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      const recipientEmails = new Set(forThisChild.map((r) => r.recipientEmail));
      expect(recipientEmails.has("parent@test.aspiresports.com")).toBe(true);
      expect(recipientEmails.has("familyonly@test.aspiresports.com")).toBe(true);
      expect(forThisChild.length).toBe(2);
    });
  });

  describe("quarterly full — synthetic past quarter (calendar-independent)", () => {
    it("sends the quarterly emailType and includes an achievement earned in the quarter", async () => {
      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportQuarterly-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      // A deliberately obscure, real-past quarter — will never collide with
      // "whatever quarter is actually current" in any test run, ever.
      const syntheticQuarter: QuarterlyReportPeriod = {
        kind: "quarterly",
        quarterKey: "2019-Q1",
        months: ["2019-01", "2019-02", "2019-03"],
        label: "Q1 2019",
        start: new Date("2019-01-01T00:00:00.000Z"),
        end: new Date("2019-04-01T00:00:00.000Z"),
      };

      const assessedAt = new Date("2019-02-10T12:00:00.000Z");
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 4,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const [domainRow] = await db
        .select({ domainId: skills.domainId })
        .from(skills)
        .where(eq(skills.id, skillId));

      await db.insert(playerAchievements).values({
        familyMemberId,
        achievementType: "skill_mastery",
        title: "Test Quarterly Achievement",
        description: "Earned during the synthetic quarter fixture window",
        triggerDomainId: domainRow?.domainId,
        earnedAt: new Date("2019-02-15T00:00:00.000Z"),
      });

      const result = await runDevelopmentReports(syntheticQuarter);
      expect(result.scanned).toBeGreaterThanOrEqual(1);
      expect(result.sent).toBeGreaterThanOrEqual(1);

      const emailType = emailTypeForPeriod(syntheticQuarter);
      expect(emailType).toBe("dev_report_2019-Q1");

      const rows = await db
        .select({ subject: emailLogs.subject, metadata: emailLogs.metadata, status: emailLogs.status })
        .from(emailLogs)
        .where(and(eq(emailLogs.emailType, emailType), eq(emailLogs.userId, parentUserId)));
      const forThisChild = rows.find(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(forThisChild).toBeDefined();
      expect(forThisChild!.status === "sent" || forThisChild!.status === "skipped").toBe(true);
      expect(forThisChild!.subject).toContain("Q1 2019");

      // Re-run is idempotent for this same synthetic quarter: the count of
      // rows tagged for THIS child must not grow.
      const countBeforeSecondRun = rows.filter(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      ).length;
      await runDevelopmentReports(syntheticQuarter);
      const rowsAfterSecond = await db
        .select({ metadata: emailLogs.metadata })
        .from(emailLogs)
        .where(and(eq(emailLogs.emailType, emailType), eq(emailLogs.userId, parentUserId)));
      const countAfterSecondRun = rowsAfterSecond.filter(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      ).length;
      expect(countAfterSecondRun).toBe(countBeforeSecondRun);
    });

    it("dryRun on a synthetic quarter returns candidates without sending", async () => {
      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportQuarterlyDryRun-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const syntheticQuarter: QuarterlyReportPeriod = {
        kind: "quarterly",
        quarterKey: "2018-Q1",
        months: ["2018-01", "2018-02", "2018-03"],
        label: "Q1 2018",
        start: new Date("2018-01-01T00:00:00.000Z"),
        end: new Date("2018-04-01T00:00:00.000Z"),
      };

      const assessedAt = new Date("2018-02-10T12:00:00.000Z");
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 3,
        observationContext: "practice",
        assessedAt,
      });

      const result = await runDevelopmentReports(syntheticQuarter, { dryRun: true });
      expect(result.candidates?.some((c) => c.familyMemberId === familyMemberId)).toBe(true);

      const emailType = emailTypeForPeriod(syntheticQuarter);
      const rows = await db.select({ metadata: emailLogs.metadata }).from(emailLogs).where(eq(emailLogs.emailType, emailType));
      const taggedForThisChild = rows.some(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(taggedForThisChild).toBe(false);
    });
  });
});
