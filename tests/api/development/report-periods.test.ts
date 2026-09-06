/**
 * Period-aware development report (Phase 3 S4): GET
 * /api/development/reports/[familyMemberId] gains a `periods` field —
 * `{ current: { quarterKey, months }, radar: [{ key, kind, snapshots }] }` —
 * computed on read from the monthly `assessment_snapshots` rows written by
 * S2's `recomputePlayerSnapshots` (see src/lib/curriculum/snapshots.ts and
 * period-key.ts).
 *
 * Two scenarios, each on a fresh test child (created via createTestChild)
 * so there's no pre-existing snapshot data to interfere with the exact
 * averages asserted below:
 *
 *  1. Monthly rows in two months of the current quarter -> the quarter
 *     rollup averages them, and each month still shows up as its own radar
 *     entry.
 *  2. A child with only a legacy (`legacy:<seasonId>`) snapshot row ->
 *     `periods.radar` is empty and the back-compat `snapshots` field falls
 *     back to the legacy row (the "zero UI change" safety net).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, and, eq, ne, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { skillDomains, skills } from "@/lib/db/schema/curriculum";
import { sports } from "@/lib/db/schema/sports";
import { assessmentSnapshots, playerAssessments } from "@/lib/db/schema/assessments";
import { recomputePlayerSnapshots } from "@/lib/curriculum/snapshots";
import { quarterKeyFor, monthsOfQuarter } from "@/lib/curriculum/period-key";
import { createTestChild } from "../../utils/classes-helpers";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

function dateForPeriod(periodKey: string, day = 10): Date {
  const [year, month] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

describe("Period-aware development report (GET /api/development/reports/[familyMemberId])", () => {
  let parentCookie: string;
  let parentUserId: string;
  let coachUserId: string;
  let skillId: string;
  let domainId: string;
  let domainDisplayName: string;

  const nowQuarterKey = quarterKeyFor(new Date());
  const currentMonths = monthsOfQuarter(nowQuarterKey);
  const [monthA, monthB] = currentMonths;

  const createdFamilyMemberIds: string[] = [];

  beforeAll(async () => {
    parentCookie = await getParentCookie();

    const db = getDb();

    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!parent) {
      throw new Error(
        "report-periods test: seeded parent@test.aspiresports.com not found — run npm run db:seed:e2e first",
      );
    }
    parentUserId = parent.id;

    const [coach] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "coach@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!coach) {
      throw new Error("report-periods test: seeded coach not found");
    }
    coachUserId = coach.id;

    const [skillRow] = await db
      .select({ id: skills.id, domainId: skills.domainId })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .where(eq(sports.slug, "soccer"))
      .orderBy(asc(skills.createdAt))
      .limit(1);
    if (!skillRow) {
      throw new Error(
        "report-periods test: no soccer skill found — run the curriculum loader " +
          "(scripts/curriculum-load.ts) against this database first",
      );
    }
    skillId = skillRow.id;
    domainId = skillRow.domainId;

    const [domainRow] = await db
      .select({ displayName: skillDomains.displayName })
      .from(skillDomains)
      .where(eq(skillDomains.id, domainId));
    if (!domainRow) {
      throw new Error("report-periods test: domain row missing for skill");
    }
    domainDisplayName = domainRow.displayName;
  });

  afterAll(async () => {
    const db = getDb();
    if (createdFamilyMemberIds.length > 0) {
      await db
        .delete(playerAssessments)
        .where(inArray(playerAssessments.familyMemberId, createdFamilyMemberIds));
      await db
        .delete(assessmentSnapshots)
        .where(inArray(assessmentSnapshots.familyMemberId, createdFamilyMemberIds));
      await db
        .delete(familyMembers)
        .where(inArray(familyMembers.id, createdFamilyMemberIds));
    }
    resetCookies();
  });

  it("rolls up two months of the current quarter, and keeps each month as its own radar entry", async () => {
    const db = getDb();
    const familyMemberId = await createTestChild(parentUserId, `ReportPeriodsQuarter-${Date.now()}`);
    createdFamilyMemberIds.push(familyMemberId);

    const dateA = dateForPeriod(monthA);
    const dateB = dateForPeriod(monthB);

    await db.insert(playerAssessments).values({
      familyMemberId,
      skillId,
      coachUserId,
      level: 2,
      observationContext: "practice",
      assessedAt: dateA,
    });
    await recomputePlayerSnapshots(db, familyMemberId, dateA);

    await db.insert(playerAssessments).values({
      familyMemberId,
      skillId,
      coachUserId,
      level: 4,
      observationContext: "practice",
      assessedAt: dateB,
    });
    await recomputePlayerSnapshots(db, familyMemberId, dateB);

    const res = await apiFetch(`/api/development/reports/${familyMemberId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);

    expect(json.periods.current.quarterKey).toBe(nowQuarterKey);
    expect(json.periods.current.months).toEqual(currentMonths);

    const quarterEntry = json.periods.radar.find(
      (e: { key: string; kind: string }) => e.kind === "quarter" && e.key === nowQuarterKey,
    );
    expect(quarterEntry).toBeDefined();
    const quarterSnap = quarterEntry.snapshots.find(
      (s: { domain: string }) => s.domain === domainDisplayName,
    );
    expect(quarterSnap).toBeDefined();
    // (2 + 4) / 2 = 3
    expect(quarterSnap.averageLevel).toBe(3);

    const monthAEntry = json.periods.radar.find(
      (e: { key: string; kind: string }) => e.kind === "month" && e.key === monthA,
    );
    expect(monthAEntry).toBeDefined();
    expect(
      monthAEntry.snapshots.find((s: { domain: string }) => s.domain === domainDisplayName)
        ?.averageLevel,
    ).toBe(2);

    const monthBEntry = json.periods.radar.find(
      (e: { key: string; kind: string }) => e.kind === "month" && e.key === monthB,
    );
    expect(monthBEntry).toBeDefined();
    expect(
      monthBEntry.snapshots.find((s: { domain: string }) => s.domain === domainDisplayName)
        ?.averageLevel,
    ).toBe(4);
  });

  it("falls back to legacy snapshots when the child has only legacy (pre-S2) rows", async () => {
    const db = getDb();
    const familyMemberId = await createTestChild(parentUserId, `ReportPeriodsLegacy-${Date.now()}`);
    createdFamilyMemberIds.push(familyMemberId);

    const legacySeasonId = crypto.randomUUID();
    await db.insert(assessmentSnapshots).values({
      familyMemberId,
      periodKey: `legacy:${legacySeasonId}`,
      domainId,
      averageLevel: "3.50",
      assessmentCount: 2,
      skillsAssessed: 2,
    });

    const res = await apiFetch(`/api/development/reports/${familyMemberId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);

    expect(json.periods.current.quarterKey).toBe(nowQuarterKey);
    expect(json.periods.radar).toEqual([]);

    const legacySnap = json.snapshots.find((s: { domain: string }) => s.domain === domainDisplayName);
    expect(legacySnap).toBeDefined();
    expect(legacySnap.averageLevel).toBe(3.5);
  });

  it("merges the back-compat snapshots per domain: current-quarter rollup where present, legacy fallback otherwise (review finding)", async () => {
    // Regression coverage for a review finding: an earlier version of the
    // reports API picked ONE source for the whole `snapshots` field
    // (current-quarter rollup OR legacy fallback), so a family with legacy
    // rows in most domains and current-quarter data in only one lost every
    // other domain from `snapshots` — exactly the shape migration 0147's
    // backfill produces for real, already-assessed families. The merge must
    // be per-domain: each domain keeps its own best-available value.
    const db = getDb();
    const familyMemberId = await createTestChild(parentUserId, `ReportPeriodsMixed-${Date.now()}`);
    createdFamilyMemberIds.push(familyMemberId);

    // 3 legacy-only domains — any domains other than the one `skillId`
    // belongs to (that one gets real current-quarter data below).
    const otherDomains = await db
      .select({ id: skillDomains.id, displayName: skillDomains.displayName })
      .from(skillDomains)
      .where(ne(skillDomains.id, domainId))
      .orderBy(asc(skillDomains.sortOrder))
      .limit(3);
    expect(
      otherDomains.length,
      "expected at least 3 other skill_domains rows — run the curriculum loader (scripts/curriculum-load.ts) first",
    ).toBe(3);

    const legacyAverageByDomainId = new Map<string, number>();
    for (const [i, dom] of otherDomains.entries()) {
      const value = 2 + i; // 2, 3, 4 — distinct per domain so a mismatch is obvious
      legacyAverageByDomainId.set(dom.id, value);
      await db.insert(assessmentSnapshots).values({
        familyMemberId,
        periodKey: `legacy:${crypto.randomUUID()}`,
        domainId: dom.id,
        averageLevel: value.toFixed(2),
        assessmentCount: 1,
        skillsAssessed: 1,
      });
    }

    // 1 current-quarter domain, via the real recompute path.
    const currentDate = dateForPeriod(monthB);
    await db.insert(playerAssessments).values({
      familyMemberId,
      skillId,
      coachUserId,
      level: 4,
      observationContext: "practice",
      assessedAt: currentDate,
    });
    await recomputePlayerSnapshots(db, familyMemberId, currentDate);

    const res = await apiFetch(`/api/development/reports/${familyMemberId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);

    // periods.radar stays pure: the quarter entry has ONLY the domain with
    // actual current-quarter data.
    const quarterEntry = json.periods.radar.find(
      (e: { key: string; kind: string }) => e.kind === "quarter" && e.key === nowQuarterKey,
    );
    expect(quarterEntry).toBeDefined();
    expect(quarterEntry.snapshots).toHaveLength(1);
    expect(quarterEntry.snapshots[0].domain).toBe(domainDisplayName);
    expect(quarterEntry.snapshots[0].averageLevel).toBe(4);

    // The back-compat `snapshots` field merges: all 4 domains present, the
    // current-quarter domain carries the rollup value, the 3 legacy-only
    // domains carry their legacy values unchanged.
    expect(json.snapshots).toHaveLength(4);
    const snapshotByDomain = new Map<string, number>(
      json.snapshots.map((s: { domain: string; averageLevel: number }) => [s.domain, s.averageLevel]),
    );
    expect(snapshotByDomain.get(domainDisplayName)).toBe(4);
    for (const dom of otherDomains) {
      expect(snapshotByDomain.get(dom.displayName)).toBe(legacyAverageByDomainId.get(dom.id));
    }
  });
});
