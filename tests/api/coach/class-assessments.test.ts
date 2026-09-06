/**
 * S3 of the 2026-09-05-player-snapshots-phase3 plan: opens the assessment
 * WRITE gate (and the per-child READ gate) on `/api/coach/assessments` to
 * class-context coaches, replacing the roster-only `isPlayerOnCoachTeam`
 * check with `canCoachReachFamilyMember` (#626's unified reach predicate —
 * roster OR active class_template assignment covering an active enrollment
 * OR class_session assignment covering a confirmed booking).
 *
 * Mirrors tests/api/coaching/portal.test.ts's fixture recipe: two seeded
 * org-scoped `coach`-role users exist in the default test org
 * (coach@test.aspiresports.com, training+coach@test.aspiresports.com). This
 * suite assigns the FIRST as the fixture template's lead and enrolls a
 * brand-new child (NOT on any of that coach's rosters) into it, then pins:
 *   - class-template-assigned coach, enrolled child, no team/season -> 201,
 *     with a monthly-bucketed snapshot row (seasonId null)
 *   - unassigned org coach (has the coach role, no team, no class
 *     assignment) -> 403
 *   - parent -> 403 (existing behavior, re-pinned)
 *   - GET's per-child read (`?familyMemberId=`) follows the same predicate
 *
 * Broad org-staff read (`isOrgCoachingStaff`) is deliberately OUT of scope
 * for this route this phase — GET's "list my players" branch (no
 * familyMemberId) stays roster-only; only the single-child read/write path
 * opens up.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema/users";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { classEnrollments, classCreditGrants } from "@/lib/db/schema/classes";
import { skills } from "@/lib/db/schema/curriculum";
import { sports } from "@/lib/db/schema/sports";
import { assessmentSnapshots, playerAssessments, playerSkillSummary } from "@/lib/db/schema/assessments";
import { familyMembers } from "@/lib/db/schema/registrations";
import { periodKeyFor } from "@/lib/curriculum/period-key";
import {
  apiFetch,
  expectJson,
  getAuthCookie,
  getCoachCookie,
  getParentCookie,
  resetCookies,
} from "../setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  createTestChild,
  createTestCreditGrant,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

describe("Class-context assessment writes (S3: canCoachReachFamilyMember)", () => {
  let organizationId: string;
  let venueId: string;
  let parentUserId: string;
  let assignedCoachId: string;
  let unassignedCoachId: string;
  let assignedCoachCookie: string;
  let unassignedCoachCookie: string;
  let parentCookie: string;

  let templateId: string;
  let childId: string;
  let grantId: string;
  let enrollmentId: string;
  let skillId: string;
  let domainId: string;

  const createdTemplateIds: string[] = [];

  beforeAll(async () => {
    ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
    await sweepOrphanedTestTemplates(organizationId);

    assignedCoachCookie = await getCoachCookie();
    unassignedCoachCookie = await getAuthCookie("training+coach@test.aspiresports.com", "TestCoach123!");
    parentCookie = await getParentCookie();

    const db = getDb();

    // Resolve each seeded coach's id BY EMAIL, scoped to a real org-scoped
    // `coach` role — same rationale as portal.test.ts: this suite needs to
    // know WHICH id is which so it can assign exactly one and assert the
    // other stays unassigned.
    async function resolveOrgCoach(email: string): Promise<string> {
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(users.email, email),
            eq(roles.name, "coach"),
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, organizationId),
          ),
        )
        .orderBy(asc(userRoles.createdAt))
        .limit(1);
      if (!row) {
        throw new Error(
          `class-assessments test: ${email} is not a seeded org coach — run npm run db:seed:e2e`,
        );
      }
      return row.id;
    }

    assignedCoachId = await resolveOrgCoach("coach@test.aspiresports.com");
    unassignedCoachId = await resolveOrgCoach("training+coach@test.aspiresports.com");

    // Hygiene: clear any leftover active class assignments for the
    // "unassigned" coach from other suites/prior runs, so the 403
    // assertions below can't be polluted by debris (same as portal.test.ts).
    await db
      .update(coachingAssignments)
      .set({ active: false })
      .where(
        and(
          eq(coachingAssignments.coachUserId, unassignedCoachId),
          inArray(coachingAssignments.kind, ["class_template", "class_session"]),
        ),
      );

    templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Assess-${Date.now()}`,
      capacity: 10,
    });
    createdTemplateIds.push(templateId);

    await db.insert(coachingAssignments).values({
      organizationId,
      coachUserId: assignedCoachId,
      kind: "class_template",
      targetId: templateId,
      role: "lead",
    });

    // A brand-new child, deliberately NOT on any of coach@test's rostered
    // teams — the only way this test can prove the ENROLLMENT branch (not
    // the pre-existing roster branch) is what's granting access.
    childId = await createTestChild(parentUserId, `Assess-Child-${Date.now()}`);

    grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId: childId,
      sessionsGranted: 10,
      idSuffix: `assess-${Date.now()}`,
    });

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, creditGrantId: grantId, status: "active" })
      .returning();
    enrollmentId = enrollment.id;

    // Any soccer skill loaded by the curriculum content loader (Task 8) —
    // same fixture pattern as assessment-snapshots.test.ts.
    const [skillRow] = await db
      .select({ id: skills.id, domainId: skills.domainId })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .where(eq(sports.slug, "soccer"))
      .orderBy(asc(skills.createdAt))
      .limit(1);
    if (!skillRow) {
      throw new Error(
        "class-assessments test: no soccer skill found — run the curriculum loader " +
          "(scripts/curriculum-load.ts) against this database first",
      );
    }
    skillId = skillRow.id;
    domainId = skillRow.domainId;

    // Defensive clean slate — childId is freshly minted above so this is
    // normally a no-op, but guards against a crashed prior run reusing the
    // same millisecond-timestamp name (vanishingly unlikely, cheap to guard).
    await db.delete(assessmentSnapshots).where(eq(assessmentSnapshots.familyMemberId, childId));
    await db.delete(playerAssessments).where(eq(playerAssessments.familyMemberId, childId));
    await db.delete(playerSkillSummary).where(eq(playerSkillSummary.familyMemberId, childId));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(assessmentSnapshots).where(eq(assessmentSnapshots.familyMemberId, childId));
    await db.delete(playerAssessments).where(eq(playerAssessments.familyMemberId, childId));
    await db.delete(playerSkillSummary).where(eq(playerSkillSummary.familyMemberId, childId));
    await db
      .delete(coachingAssignments)
      .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId ?? "")));
    if (enrollmentId) {
      await db.delete(classEnrollments).where(eq(classEnrollments.id, enrollmentId));
    }
    if (grantId) {
      await db.delete(classCreditGrants).where(eq(classCreditGrants.id, grantId));
    }
    if (childId) {
      await db.delete(familyMembers).where(eq(familyMembers.id, childId));
    }
    await cleanupTestClassFixtures(createdTemplateIds);
    resetCookies();
  });

  describe("POST /api/coach/assessments — class-template-assigned coach", () => {
    it("201s for an enrolled child with NO teamId/seasonId, and writes a monthly snapshot with seasonId null", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        method: "POST",
        cookie: assignedCoachCookie,
        body: JSON.stringify({
          familyMemberId: childId,
          skillId,
          level: 3,
          observationContext: "practice",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.assessment.familyMemberId).toBe(childId);
      expect(json.assessment.teamId).toBeNull();
      expect(json.assessment.seasonId).toBeNull();

      const nowPeriodKey = periodKeyFor(new Date(json.assessment.assessedAt));
      const db = getDb();
      const [snapshot] = await db
        .select()
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, childId),
            eq(assessmentSnapshots.domainId, domainId),
            eq(assessmentSnapshots.periodKey, nowPeriodKey),
          ),
        );
      expect(snapshot).toBeDefined();
      expect(snapshot.seasonId).toBeNull();
      expect(Number(snapshot.averageLevel)).toBe(3);
    });

    it("403s for an unassigned org coach", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        method: "POST",
        cookie: unassignedCoachCookie,
        body: JSON.stringify({ familyMemberId: childId, skillId, level: 2 }),
      });
      expect(res.status).toBe(403);
    });

    it("403s for a parent", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({ familyMemberId: childId, skillId, level: 2 }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/coach/assessments — per-child reach follows the same predicate", () => {
    it("200s for the class-assigned coach and includes the posted assessment", async () => {
      const res = await apiFetch(`/api/coach/assessments?familyMemberId=${childId}`, {
        cookie: assignedCoachCookie,
      });
      const json = await expectJson(res, 200);
      const found = json.assessments.find(
        (a: { familyMemberId: string; skillId: string }) => a.familyMemberId === childId && a.skillId === skillId,
      );
      expect(found).toBeDefined();
    });

    it("403s for an unassigned org coach", async () => {
      const res = await apiFetch(`/api/coach/assessments?familyMemberId=${childId}`, {
        cookie: unassignedCoachCookie,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/coach/assessments — list branch (no familyMemberId) for a zero-team coach", () => {
    // Pins the deliberate post-requireCoachPortalAccess-swap contract: a
    // coach-role user with ZERO team assignments now gets 200 + an empty
    // list here, not the old flat 403 `requireCoachAccess` used to produce.
    // `training+coach@test.aspiresports.com` is never assigned as
    // coachUserId/assistantCoachUserId on any team in the e2e seed (see
    // seed-e2e-tests.ts's seedTrainingFixtures — it only grants the
    // org-scoped `coach` role), and this file's beforeAll already
    // deactivates its class assignments, so it's roster-empty AND
    // class-empty by the time this test runs.
    it("200s with an empty assessments array, not 403", async () => {
      const res = await apiFetch("/api/coach/assessments", {
        cookie: unassignedCoachCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.assessments).toEqual([]);
    });
  });
});
