/**
 * POST /api/cron/send-development-reports (Phase 3 S6 — the repo's FIRST
 * monthly cron). Mock messaging is on for this dev server (MESSAGING_MOCK),
 * which still writes `email_logs` rows — so dedupe is fully testable here
 * even though no real email goes out.
 *
 * Two testing strategies, matched to what's calendar-dependent vs not:
 *   - The MONTHLY-subset regression scenarios drive the real HTTP endpoint
 *     with an explicit `?period=YYYY-MM` override (F2's ops-recovery
 *     parameter — see resolveOverridePeriod's docstring in
 *     src/lib/reports/development-reports.ts) naming a synthetic PAST month
 *     fixed at write time. This is what makes them run unconditionally
 *     year-round instead of early-returning whenever
 *     `computeReportPeriod(new Date())` happens to resolve to "quarterly"
 *     for the 4 months/year that closes a quarter (F3 fix — those months
 *     used to get ZERO coverage of the F1 opt-out and no-guardian
 *     regressions below). One plain HTTP smoke test (no override) is kept
 *     to prove the real "now"-driven path still works end to end; it may
 *     skip on a quarter-close month since it isn't asserting anything
 *     period-specific.
 *   - The QUARTERLY-full scenarios call `runDevelopmentReports` directly
 *     with a synthetic PAST quarter (2019-Q1 / 2018-Q1) rather than going
 *     through the HTTP endpoint — this exercises the exact same
 *     scan/build/send/dedupe pipeline the endpoint uses, without waiting
 *     for the calendar to actually land on a quarter-close month.
 * See tests/unit/reports/development-reports-period.test.ts for exhaustive
 * fixed-date coverage of WHICH branch fires when, and
 * tests/unit/reports/development-reports-period-override.test.ts for
 * resolveOverridePeriod's own shape/future-rejection unit coverage.
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
  type MonthlyReportPeriod,
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
  const createdUserIds: string[] = [];

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
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
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

  describe("monthly subset — synthetic past month via ?period= override (F3: year-round coverage)", () => {
    it("HTTP smoke: the live cron's real just-closed period responds 200 (may skip on a quarter-close month)", async () => {
      const period = computeReportPeriod(new Date());
      if (period.kind !== "monthly") {
        // The live calendar happens to be on a quarter-close month right
        // now — this specific plain-path smoke isn't meaningful today
        // (nothing period-specific is asserted here; the regressions below
        // run unconditionally via the ?period= override instead).
        return;
      }
      const res = await apiFetch(`${ENDPOINT}?dryRun=1`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const json = await expectJson(res, 200);
      expect(json.period.kind).toBe("monthly");
    });

    it("sends once per (child, guardian) for a child with an assessment this period, then skips on re-run", async () => {
      const db = getDb();
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-01",
        label: "January 2019",
        start: new Date("2019-01-01T00:00:00.000Z"),
        end: new Date("2019-02-01T00:00:00.000Z"),
      };

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

      const first = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(first, 200);

      const logsAfterFirst = await logsForThisChild();
      expect(logsAfterFirst.length).toBe(1);
      expect(logsAfterFirst[0].status === "sent" || logsAfterFirst[0].status === "skipped").toBe(true);

      const second = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(second, 200);

      const logsAfterSecond = await logsForThisChild();
      expect(logsAfterSecond.length).toBe(1);
    });

    it("a child with zero assessments/notes this period is not counted as a candidate", async () => {
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-02",
        label: "February 2019",
        start: new Date("2019-02-01T00:00:00.000Z"),
        end: new Date("2019-03-01T00:00:00.000Z"),
      };

      const db = getDb();
      const familyMemberId = await createTestChild(parentUserId, `DevReportNoActivity-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);

      const dryRunRes = await apiFetch(`${ENDPOINT}?dryRun=1&period=${period.periodKey}`, {
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

    it("a candidate with zero resolvable guardians still logs a skipped breadcrumb (F2 regression)", async () => {
      // Deliberately mid-quarter (NOT Mar/Jun/Sep/Dec) — a quarter-ending
      // month can never resolve to a bare monthly period (see the
      // ?period= quarter-collapse coverage below), so a hand-built
      // MonthlyReportPeriod fixture on one would silently diverge from
      // what the ?period= override actually runs against.
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-08",
        label: "August 2019",
        start: new Date("2019-08-01T00:00:00.000Z"),
        end: new Date("2019-09-01T00:00:00.000Z"),
      };

      const db = getDb();

      // A dependent (`family_members.parent_user_id` set) can never legally
      // reach zero guardians — the XOR constraint requires it. The scan
      // (scanCandidateFamilyMemberIds) has no filter on
      // parentUserId-vs-selfUserId, though, so a SELF-registered adult row
      // (selfUserId set, parentUserId null, no family_member_parents link)
      // qualifies as a candidate if they have activity, and resolveGuardians
      // correctly finds nobody to notify — the natural, unmocked path to
      // this edge case.
      const email = `dev-report-self-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
      const [selfUser] = await db
        .insert(users)
        .values({ email, firstName: "SelfNoGuardian", lastName: "Test" })
        .returning({ id: users.id });
      createdUserIds.push(selfUser.id);

      const [selfMember] = await db
        .insert(familyMembers)
        .values({ selfUserId: selfUser.id, firstName: "SelfNoGuardian", lastName: "Test" })
        .returning({ id: familyMembers.id });
      const familyMemberId = selfMember.id;
      createdFamilyMemberIds.push(familyMemberId);

      const assessedAt = new Date(period.start.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 2,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      // Confirm the scan actually picks this candidate up (otherwise the
      // rest of this test would trivially pass for the wrong reason).
      const dryRunRes = await apiFetch(`${ENDPOINT}?dryRun=1&period=${period.periodKey}`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const dryRunJson = await expectJson(dryRunRes, 200);
      const candidateIds = dryRunJson.candidates.map((c: { familyMemberId: string }) => c.familyMemberId);
      expect(candidateIds).toContain(familyMemberId);

      const res = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      await expectJson(res, 200);

      const emailType = emailTypeForPeriod(period);
      const rows = await db
        .select({ recipientEmail: emailLogs.recipientEmail, status: emailLogs.status, metadata: emailLogs.metadata })
        .from(emailLogs)
        .where(eq(emailLogs.emailType, emailType));
      const forThisChild = rows.filter(
        (r) => (r.metadata as Record<string, unknown> | null)?.familyMemberId === familyMemberId,
      );
      expect(forThisChild.length).toBe(1);
      expect(forThisChild[0].status).toBe("skipped");
      expect((forThisChild[0].metadata as Record<string, unknown>).reason).toBe("no_guardian");
      // Sentinel recipient, not a real address — nobody was actually emailed.
      expect(forThisChild[0].recipientEmail).toBeTruthy();
      expect(forThisChild[0].recipientEmail).not.toBe(email);
    });

    it("dryRun=1 sends nothing (candidate present but no new email_logs row)", async () => {
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-04",
        label: "April 2019",
        start: new Date("2019-04-01T00:00:00.000Z"),
        end: new Date("2019-05-01T00:00:00.000Z"),
      };

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

      const dryRunRes = await apiFetch(`${ENDPOINT}?dryRun=1&period=${period.periodKey}`, {
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
      const liveRes = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
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
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-05",
        label: "May 2019",
        start: new Date("2019-05-01T00:00:00.000Z"),
        end: new Date("2019-06-01T00:00:00.000Z"),
      };

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

      const res = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
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
      // Mid-quarter, same reasoning as the F2-regression test above — June
      // is a quarter-ending month and can't exist as a bare monthly period.
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-10",
        label: "October 2019",
        start: new Date("2019-10-01T00:00:00.000Z"),
        end: new Date("2019-11-01T00:00:00.000Z"),
      };

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

      const res = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
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

    it("an opted-out linked guardian (canReceiveMessages=false) never gets emailed (F1 regression)", async () => {
      const period: MonthlyReportPeriod = {
        kind: "monthly",
        periodKey: "2019-07",
        label: "July 2019",
        start: new Date("2019-07-01T00:00:00.000Z"),
        end: new Date("2019-08-01T00:00:00.000Z"),
      };

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

      // Same shape as "multiple guardians ... each get their own email"
      // above (primary guardian via createTestChild + one linked co-parent),
      // but this co-parent has explicitly opted out of messages. The
      // resolveGuardians linked-guardian query must exclude them — only the
      // PRIMARY guardian (unconditional; no opt-out flag exists on that
      // path) should ever be sent to.
      const familyMemberId = await createTestChild(parentUserId, `DevReportOptedOut-${Date.now()}`);
      createdFamilyMemberIds.push(familyMemberId);
      await db.insert(familyMemberParents).values({
        familyMemberId,
        parentUserId: coParent.id,
        relationship: "guardian",
        canReceiveMessages: false,
      });

      const assessedAt = new Date(period.start.getTime() + 6 * 24 * 60 * 60 * 1000);
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 3,
        observationContext: "practice",
        assessedAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, assessedAt);

      const res = await apiFetch(`${ENDPOINT}?period=${period.periodKey}`, {
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
      expect(recipientEmails.has("familyonly@test.aspiresports.com")).toBe(false);
      expect(forThisChild.length).toBe(1);
    });
  });

  describe("?period= override (F2 ops recovery)", () => {
    it("rejects a malformed ?period= shape with 422", async () => {
      const res = await apiFetch(`${ENDPOINT}?period=not-a-period`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(typeof json.error).toBe("string");
    });

    it("rejects a not-yet-closed (future) ?period= with 422", async () => {
      const res = await apiFetch(`${ENDPOINT}?period=2099-01`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(typeof json.error).toBe("string");
    });

    it("rejects a not-yet-closed (future) quarterly ?period= with 422", async () => {
      const res = await apiFetch(`${ENDPOINT}?period=2099-Q1`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      expect(res.status).toBe(422);
    });

    it("a quarter-ending ?period=YYYY-MM (Dec) collapses to the quarterly report, matching the scheduler's own rule", async () => {
      // computeReportPeriod never produces a standalone monthly for
      // Mar/Jun/Sep/Dec (closedMonth % 3 === 0 always collapses to
      // quarterly) — resolveOverridePeriod must mirror that exactly or
      // ?period=2019-12 would run the wrong pipeline (subset instead of
      // full) under the wrong emailType.
      const res = await apiFetch(`${ENDPOINT}?dryRun=1&period=2019-12`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const json = await expectJson(res, 200);
      expect(json.period.kind).toBe("quarterly");
      expect(json.period.key).toBe("2019-Q4");
      expect(json.period.months).toEqual(["2019-10", "2019-11", "2019-12"]);
    });

    it("a mid-quarter ?period=YYYY-MM stays a standalone monthly period", async () => {
      const res = await apiFetch(`${ENDPOINT}?dryRun=1&period=2019-11`, {
        method: "POST",
        headers: { "x-cron-secret": CRON_SECRET },
      });
      const json = await expectJson(res, 200);
      expect(json.period.kind).toBe("monthly");
      expect(json.period.key).toBe("2019-11");
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
