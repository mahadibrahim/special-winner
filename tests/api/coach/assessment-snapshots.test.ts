/**
 * Assessment snapshot pipeline (Task 9, curriculum-recovery plan).
 *
 * Exercises the write-hook in `src/pages/api/coach/assessments/index.ts`:
 * POSTing an assessment should transparently recompute
 * `assessment_snapshots` for the affected player/season/domain, without
 * changing the assessment endpoint's own response contract.
 *
 * Uses the seeded coach (coach@test.aspiresports.com), the seeded child
 * "Tommy" (on "E2E Test Team", coached by the seeded coach — see
 * src/lib/db/seeds/seed-e2e-tests.ts), and a soccer skill loaded by the
 * curriculum content loader (Task 8 / scripts/curriculum-load.ts). This
 * test is written but NOT run by the implementer — the controller runs it
 * after migrating, re-seeding e2e data, and loading curriculum content
 * into staging (Task 11).
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
import { getCoachCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Assessment snapshot pipeline (POST /api/coach/assessments)", () => {
  let coachCookie: string;
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

    // Clean slate: remove any snapshot left over from a previous run so
    // "new" vs "improving" trend assertions aren't order-dependent.
    await db
      .delete(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.seasonId, seasonId),
          eq(assessmentSnapshots.domainId, domainId),
        ),
      );

    // The "only one skill is assessed" assumption below (used to predict an
    // exact domain average) only holds if `skillId` is the sole skill in
    // `domainId` with an assessment for Tommy in this season. The e2e seed's
    // development-radar fixture (Task 11, src/lib/db/seeds/seed-e2e-tests.ts)
    // now assesses Tommy on one skill in EVERY domain for this same season so
    // the parent radar has data — so any other skill sharing this domain
    // must be cleared here rather than relying on skillId happening to be
    // the only one ever assessed.
    const domainSkillRows = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.domainId, domainId));
    const otherDomainSkillIds = domainSkillRows
      .map((s) => s.id)
      .filter((id) => id !== skillId);
    if (otherDomainSkillIds.length > 0) {
      await db
        .delete(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            eq(playerAssessments.seasonId, seasonId),
            inArray(playerAssessments.skillId, otherDomainSkillIds),
          ),
        );
    }
  });

  afterAll(() => {
    resetCookies();
  });

  it("creates a snapshot with trend 'new' on the first assessment for a domain", async () => {
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId,
        skillId,
        teamId,
        seasonId,
        level: 2,
        observationContext: "practice",
      }),
    });

    // The endpoint's response contract is unchanged by the snapshot hook.
    await expectJson(res, 201);

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.seasonId, seasonId),
          eq(assessmentSnapshots.domainId, domainId),
        ),
      );

    expect(snapshot).toBeDefined();
    expect(Number(snapshot.averageLevel)).toBe(2);
    expect(snapshot.trend).toBe("new");
    expect(snapshot.previousAverageLevel).toBeNull();
  });

  it("recomputes with trend 'improving' and sets previousAverageLevel on a higher second assessment", async () => {
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

    await expectJson(res, 201);

    const db = getDb();
    const [snapshot] = await db
      .select()
      .from(assessmentSnapshots)
      .where(
        and(
          eq(assessmentSnapshots.familyMemberId, familyMemberId),
          eq(assessmentSnapshots.seasonId, seasonId),
          eq(assessmentSnapshots.domainId, domainId),
        ),
      );

    expect(snapshot).toBeDefined();
    // Only one skill is assessed here, so the domain average jumps to the
    // latest level for that skill (2 -> 5).
    expect(Number(snapshot.averageLevel)).toBe(5);
    expect(snapshot.trend).toBe("improving");
    expect(snapshot.previousAverageLevel).not.toBeNull();
    expect(Number(snapshot.previousAverageLevel)).toBe(2);
  });

  it("skips the snapshot write when seasonId is omitted (null-season skip rule)", async () => {
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId,
        skillId,
        teamId,
        // no seasonId
        level: 3,
        observationContext: "practice",
      }),
    });

    // The assessment write itself must still succeed even though the
    // snapshot recompute is skipped for a null seasonId.
    await expectJson(res, 201);
  });
});
