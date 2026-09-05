/**
 * Assessment snapshot pipeline (Task 9, curriculum-recovery plan; rewritten
 * for monthly period bucketing in Phase 3 S2 — see
 * src/lib/curriculum/snapshots.ts and src/lib/curriculum/period-key.ts).
 *
 * Exercises the write-hook in `src/pages/api/coach/assessments/index.ts`:
 * POSTing an assessment should transparently recompute
 * `assessment_snapshots` for the affected player/domain in the UTC calendar
 * month of the assessment's `assessedAt`, without changing the assessment
 * endpoint's own response contract.
 *
 * Uses the seeded coach (coach@test.aspiresports.com), the seeded child
 * "Tommy" (on "E2E Test Team", coached by the seeded coach — see
 * src/lib/db/seeds/seed-e2e-tests.ts), and a soccer skill loaded by the
 * curriculum content loader (Task 8 / scripts/curriculum-load.ts).
 *
 * NOTE on cross-month cases: the assessments POST route has no
 * client-supplied `assessedAt` (it's always `defaultNow()` at insert time),
 * so API-level tests can only ever land in "now"'s UTC month. The
 * two-month / trend-across-months / same-month-vs-cross-month distinctions
 * are therefore exercised by calling `recomputePlayerSnapshots` directly
 * against fixed, far-future dates (year 2031) that can never collide with
 * real seeded or dev-generated data.
 *
 * NOTE on S3: the route now gates writes on `canCoachReachFamilyMember`
 * (roster OR class assignment) rather than the roster-only
 * `isPlayerOnCoachTeam`. This file still exercises the "class-context, no
 * season" case as a team-context assessment with `seasonId` omitted, since
 * the fixture player here is a roster player — the validator for `seasonId`
 * only fires when the field is present, so this remains a legitimate
 * request. Genuine class-enrollment-only reach is covered end-to-end by
 * tests/api/coach/class-assessments.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { teams } from "@/lib/db/schema/teams";
import { sports } from "@/lib/db/schema/sports";
import { skills } from "@/lib/db/schema/curriculum";
import { assessmentSnapshots, playerAssessments } from "@/lib/db/schema/assessments";
import { recomputePlayerSnapshots } from "@/lib/curriculum/snapshots";
import { periodKeyFor } from "@/lib/curriculum/period-key";
import { getCoachCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Assessment snapshot pipeline (POST /api/coach/assessments, monthly buckets)", () => {
  let coachCookie: string;
  let coachUserId: string;
  let familyMemberId: string;
  let teamId: string;
  let seasonId: string;
  let skillId: string;
  let domainId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    const db = getDb();

    // Seeded child "Tommy" (parent@test.aspiresports.com's dependent) —
    // multi-tenant hazard: explicit orderBy per CLAUDE.md.
    const [tommy] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.parentUserId, users.id))
      .where(
        and(
          eq(users.email, "parent@test.aspiresports.com"),
          eq(familyMembers.firstName, "Tommy"),
        ),
      )
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (!tommy) {
      throw new Error(
        "assessment-snapshots test: seeded child 'Tommy' not found — run npm run db:seed:e2e first",
      );
    }
    familyMemberId = tommy.id;

    const [coach] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "coach@test.aspiresports.com"))
      .orderBy(asc(users.createdAt))
      .limit(1);
    if (!coach) {
      throw new Error("assessment-snapshots test: seeded coach not found");
    }
    coachUserId = coach.id;

    // Seeded "E2E Test Team", coached by coach@test.aspiresports.com.
    const [team] = await db
      .select({ id: teams.id, seasonId: teams.seasonId })
      .from(teams)
      .where(eq(teams.name, "E2E Test Team"))
      .orderBy(asc(teams.createdAt))
      .limit(1);
    if (!team) {
      throw new Error(
        "assessment-snapshots test: seeded 'E2E Test Team' not found — run npm run db:seed:e2e first",
      );
    }
    teamId = team.id;
    seasonId = team.seasonId;

    // Any soccer skill loaded by the curriculum content loader (Task 8).
    const [skillRow] = await db
      .select({ id: skills.id, domainId: skills.domainId })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .where(eq(sports.slug, "soccer"))
      .orderBy(asc(skills.createdAt))
      .limit(1);
    if (!skillRow) {
      throw new Error(
        "assessment-snapshots test: no soccer skill found — run the curriculum loader " +
          "(scripts/curriculum-load.ts) against this database first",
      );
    }
    skillId = skillRow.id;
    domainId = skillRow.domainId;

    // Clean slate: remove every snapshot for this member+domain regardless
    // of periodKey (monthly bucketing means stale rows from a previous test
    // run, or from a different calendar month, would otherwise sit beside
    // the ones this run writes and confuse the "single row per assertion"
    // queries below).
    await db
      .delete(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.domainId, domainId),
        ),
      );

    // Wipe every historical assessment for THIS skill (any season, any
    // time) so the "first assessment" test starts from a known trend='new'
    // baseline instead of whatever a prior run left behind.
    await db
      .delete(playerAssessments)
      .where(
        and(eq(playerAssessments.familyMemberId, familyMemberId), eq(playerAssessments.skillId, skillId)),
      );

    // The "only one skill is assessed" assumption below (used to predict an
    // exact domain average) only holds if `skillId` is the sole skill in
    // `domainId` with an assessment for Tommy. The e2e seed's
    // development-radar fixture (Task 11, src/lib/db/seeds/seed-e2e-tests.ts)
    // assesses Tommy on one skill in EVERY domain (refreshed to the current
    // month on every seed run, S2) — so any other skill sharing this domain
    // must be cleared here, regardless of season, or it silently joins the
    // aggregation for whichever month it happens to land in.
    const domainSkillRows = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.domainId, domainId));
    const otherDomainSkillIds = domainSkillRows.map((s) => s.id).filter((id) => id !== skillId);
    if (otherDomainSkillIds.length > 0) {
      await db
        .delete(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            inArray(playerAssessments.skillId, otherDomainSkillIds),
          ),
        );
    }
  });

  afterAll(() => {
    resetCookies();
  });

  it("creates a current-month snapshot with trend 'new' on the first team-context assessment, even without a seasonId (class-context path now produces a snapshot)", async () => {
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId,
        skillId,
        teamId,
        // no seasonId — the "class-context" no-season path S2 stops
        // silently dropping.
        level: 2,
        observationContext: "practice",
      }),
    });

    const json = await expectJson(res, 201);
    const nowPeriodKey = periodKeyFor(new Date(json.assessment.assessedAt));

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.domainId, domainId),
          eq(assessmentSnapshots.periodKey, nowPeriodKey),
        ),
      );

    expect(snapshot).toBeDefined();
    expect(Number(snapshot.averageLevel)).toBe(2);
    expect(snapshot.trend).toBe("new");
    expect(snapshot.previousAverageLevel).toBeNull();
    // New rows always write seasonId null — periodKey is now the natural
    // temporal key, seasonId only stays populated on pre-S2 legacy rows.
    expect(snapshot.seasonId).toBeNull();
  });

  it("overwrites the same-month row on a second assessment, without treating the pre-update value as the trend baseline", async () => {
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId,
        skillId,
        teamId,
        seasonId,
        level: 5,
        observationContext: "practice",
      }),
    });

    const json = await expectJson(res, 201);
    const nowPeriodKey = periodKeyFor(new Date(json.assessment.assessedAt));

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.domainId, domainId),
          eq(assessmentSnapshots.periodKey, nowPeriodKey),
        ),
      );

    expect(snapshot).toBeDefined();
    // Only one skill is assessed here, so the domain average jumps to the
    // latest level for that skill (2 -> 5) — same-month upsert overwrites
    // the row in place rather than accumulating a second row.
    expect(Number(snapshot.averageLevel)).toBe(5);
    // Trend still compares against the PREVIOUS MONTH's row, which doesn't
    // exist — not against this same period's pre-update average of 2. So
    // the trend stays 'new', not 'improving'.
    expect(snapshot.trend).toBe("new");
    expect(snapshot.previousAverageLevel).toBeNull();
  });

  describe("cross-month bucketing (direct recomputePlayerSnapshots calls, fixed far-future dates)", () => {
    // Year 2031 can never collide with real seeded/dev data, so these two
    // months are exclusively owned by this test.
    const januaryAt = new Date("2031-01-15T10:00:00.000Z");
    const februaryAt = new Date("2031-02-20T10:00:00.000Z");
    const januaryKey = "2031-01";
    const februaryKey = "2031-02";

    beforeAll(async () => {
      const db = getDb();
      await db
        .delete(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.domainId, domainId),
            inArray(assessmentSnapshots.periodKey, [januaryKey, februaryKey]),
          ),
        );
      await db
        .delete(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            eq(playerAssessments.skillId, skillId),
            inArray(playerAssessments.assessedAt, [januaryAt, februaryAt]),
          ),
        );
    });

    it("produces two independent period rows, with the later month trending off the earlier one", async () => {
      const db = getDb();

      // January: a lone assessment, seasonId omitted (class-context) —
      // confirms the no-season path also works when driven directly.
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 2,
        seasonId: null,
        observationContext: "practice",
        assessedAt: januaryAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, januaryAt);

      const [januaryRow] = await db
        .select()
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.domainId, domainId),
            eq(assessmentSnapshots.periodKey, januaryKey),
          ),
        );
      expect(januaryRow).toBeDefined();
      expect(Number(januaryRow.averageLevel)).toBe(2);
      expect(januaryRow.trend).toBe("new");
      expect(januaryRow.previousAverageLevel).toBeNull();
      expect(januaryRow.seasonId).toBeNull();

      // February: a second, higher assessment for the SAME skill. Because
      // it falls outside January's [monthStart, nextMonthStart) window, it
      // gets its own row rather than overwriting January's.
      await db.insert(playerAssessments).values({
        familyMemberId,
        skillId,
        coachUserId,
        level: 4,
        seasonId: null,
        observationContext: "practice",
        assessedAt: februaryAt,
      });
      await recomputePlayerSnapshots(db, familyMemberId, februaryAt);

      const [januaryRowAfter] = await db
        .select()
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.domainId, domainId),
            eq(assessmentSnapshots.periodKey, januaryKey),
          ),
        );
      const [februaryRow] = await db
        .select()
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.domainId, domainId),
            eq(assessmentSnapshots.periodKey, februaryKey),
          ),
        );

      // January's row is untouched by February's recompute.
      expect(Number(januaryRowAfter.averageLevel)).toBe(2);
      expect(januaryRowAfter.trend).toBe("new");

      // February gets its own row, trending off January's average.
      expect(februaryRow).toBeDefined();
      expect(Number(februaryRow.averageLevel)).toBe(4);
      expect(februaryRow.trend).toBe("improving");
      expect(februaryRow.previousAverageLevel).not.toBeNull();
      expect(Number(februaryRow.previousAverageLevel)).toBe(2);
      expect(februaryRow.seasonId).toBeNull();
    });
  });
});
