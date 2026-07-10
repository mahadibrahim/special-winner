/**
 * Development report payload shape (Plan 2 Tasks 9+10, D7 parent
 * development-report fixes).
 *
 * GET /api/development/reports/[familyMemberId] previously returned
 * `domainProgress[].domain.name` (a raw enum value like "technical") with
 * no `slug`, so the client's `DOMAIN_CONFIG[data.domain.slug]` lookup was
 * always undefined and every domain rendered the same fallback icon.
 * `recentAssessments[]` also carried only free-text `notes`, never the
 * growth-framed `strengths` / `areasForImprovement` fields already present
 * on `player_assessments`.
 *
 * This spec pins the additive shape: every domain carries both `slug`
 * (the enum value) and `displayName`, and every recent assessment carries
 * `strengths` / `areasForImprovement` arrays (possibly empty for the
 * seeded fixture, which doesn't set them) alongside `domainDisplayName`.
 *
 * Uses the seeded child "Tommy" (parent@test.aspiresports.com's
 * dependent), who the e2e seed's development-radar fixture (Task 11)
 * assesses on one skill per domain — see
 * src/lib/db/seeds/seed-e2e-tests.ts and
 * tests/api/coach/assessment-snapshots.test.ts for the same fixture.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

const DOMAIN_NAMES = ["technical", "tactical", "physical", "psychological"];

describe("Development report payload shape (GET /api/development/reports/[familyMemberId])", () => {
  let parentCookie: string;
  let tommyId: string;

  beforeAll(async () => {
    parentCookie = await getParentCookie();

    const db = getDb();

    // Seeded child "Tommy" — multi-tenant hazard: explicit orderBy per
    // CLAUDE.md (the CI DB accumulates fixtures across runs).
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
        "development-report-shape test: seeded child 'Tommy' not found — run npm run db:seed:e2e first",
      );
    }
    tommyId = tommy.id;
  });

  afterAll(() => {
    resetCookies();
  });

  it("every domain carries a slug (enum value) and a displayName", async () => {
    const res = await apiFetch(`/api/development/reports/${tommyId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);

    expect(Array.isArray(json.domainProgress)).toBe(true);
    expect(json.domainProgress.length).toBeGreaterThan(0);

    for (const entry of json.domainProgress) {
      expect(DOMAIN_NAMES).toContain(entry.domain.slug);
      expect(entry.domain.slug).toBe(entry.domain.name);
      expect(typeof entry.domain.displayName).toBe("string");
      expect(entry.domain.displayName.length).toBeGreaterThan(0);
    }
  });

  it("every recent assessment carries strengths/areasForImprovement arrays and a domain display name", async () => {
    const res = await apiFetch(`/api/development/reports/${tommyId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    const json = await expectJson(res, 200);

    expect(Array.isArray(json.recentAssessments)).toBe(true);
    expect(json.recentAssessments.length).toBeGreaterThan(0);

    for (const assessment of json.recentAssessments) {
      expect(Array.isArray(assessment.strengths)).toBe(true);
      expect(Array.isArray(assessment.areasForImprovement)).toBe(true);
      expect(typeof assessment.domainDisplayName).toBe("string");
      expect(assessment.domainDisplayName.length).toBeGreaterThan(0);
    }
  });
});
