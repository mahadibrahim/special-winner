/**
 * Tenant-scoping checks for the curriculum API endpoints.
 *
 * Skills, activities, and templates each carry an organizationId column
 * where `null` means "global / platform-wide" and a non-null value means
 * "owned by that org". The endpoints enforce:
 *
 *   - GET list: WHERE organizationId = caller's org OR organizationId IS NULL.
 *   - POST: forces organizationId = caller's org.
 *   - POST: sportId must belong to caller's org (no pivot via foreign sport).
 *   - GET/PUT/DELETE [id]: cross-tenant ids are rejected with 403 +
 *     "Resource not found".
 *
 * Templates already had this enforcement before PR #68; skills + activities
 * got it in that PR. These tests guard against regression on both ends.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  testSlug,
} from "../setup/test-helpers";

let adminCookie: string;

// Org A (caller) resources.
let orgASportId: string;
// skill_domains and development_stages are *reference* tables seeded out-of-band
// (production seeds them via src/lib/db/seed-curriculum.ts; CI does NOT run that
// seed). When the table is empty, the skill / template POSTs that need a
// domainId / stageId become unreachable by API — we mark those tests as
// skipped at runtime instead of failing them.
let orgASkillDomainId: string | null = null;
let orgADevelopmentStageId: string | null = null;

// Org B (cross-tenant) resources via the test-only fixture endpoint.
let orgBSportId: string;

beforeAll(async () => {
  adminCookie = await getAdminCookie();

  // Org B fixtures — only available when E2E_TEST_ENDPOINTS=yes (CI/test env).
  const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb", {
    method: "GET",
  });
  if (orgBRes.status !== 200) {
    throw new Error(
      `Could not load Org B fixtures (status ${orgBRes.status}) — set E2E_TEST_ENDPOINTS=yes and run npm run db:seed:e2e.`,
    );
  }
  orgBSportId = (await orgBRes.json()).sportId;
  expect(orgBSportId).toBeTruthy();

  // Org A sportId — first sport returned by the standard admin endpoint.
  const sportsRes = await apiFetch("/api/admin/sports", {
    method: "GET",
    cookie: adminCookie,
  });
  const sportsJson = await expectJson(sportsRes, 200);
  expect(sportsJson.sports.length).toBeGreaterThan(0);
  orgASportId = sportsJson.sports[0].id;

  // skill_domains may be empty in CI — capture whatever's there but don't
  // require it. The tests that need it skip themselves below.
  const skillsRes = await apiFetch("/api/admin/curriculum/skills", {
    method: "GET",
    cookie: adminCookie,
  });
  const skillsJson = await expectJson(skillsRes, 200);
  if (Array.isArray(skillsJson.domains) && skillsJson.domains.length > 0) {
    orgASkillDomainId = skillsJson.domains[0].id;
  }

  // development_stages may also be empty in CI. Same handling.
  const templatesRes = await apiFetch("/api/admin/curriculum/templates", {
    method: "GET",
    cookie: adminCookie,
  });
  const templatesJson = await expectJson(templatesRes, 200);
  if (Array.isArray(templatesJson.stages) && templatesJson.stages.length > 0) {
    orgADevelopmentStageId = templatesJson.stages[0].id;
  }
});

// ----------------------------------------------------------------------------
// Skills
// ----------------------------------------------------------------------------

describe("curriculum/skills — tenant scoping", () => {
  it("POST with cross-org sportId returns 403/404", async (ctx) => {
    if (!orgASkillDomainId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch("/api/admin/curriculum/skills", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgBSportId,
        domainId: orgASkillDomainId,
        name: "Should be rejected",
        slug: testSlug("x-skill"),
        assessmentMethod: "observation",
      }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("POST with org-local sportId creates a skill scoped to caller's org", async (ctx) => {
    if (!orgASkillDomainId) {
      ctx.skip();
      return;
    }
    const slug = testSlug("scoped-skill");
    const createRes = await apiFetch("/api/admin/curriculum/skills", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        domainId: orgASkillDomainId,
        name: "Scoped Skill Sample",
        slug,
        assessmentMethod: "observation",
      }),
    });
    const created = await expectJson(createRes, 201);
    expect(created.skill).toBeDefined();
    expect(created.skill.id).toBeTruthy();
    // Endpoint forces organizationId = caller's org; cannot be null.
    expect(created.skill.organizationId).toBeTruthy();

    // Skill should appear in the org's list.
    const listRes = await apiFetch("/api/admin/curriculum/skills", {
      method: "GET",
      cookie: adminCookie,
    });
    const listJson = await expectJson(listRes, 200);
    const found = (listJson.skills as Array<{ id: string }>).find(
      (s) => s.id === created.skill.id,
    );
    expect(found).toBeDefined();
  });
});

// ----------------------------------------------------------------------------
// Activities
// ----------------------------------------------------------------------------

describe("curriculum/activities — tenant scoping", () => {
  it("POST with cross-org sportId returns 403/404", async () => {
    const res = await apiFetch("/api/admin/curriculum/activities", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgBSportId,
        name: "Should be rejected",
        slug: testSlug("x-act"),
        activityType: "technical",
        howToPlay: "n/a",
      }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("POST with org-local sportId creates an activity scoped to caller's org", async () => {
    const createRes = await apiFetch("/api/admin/curriculum/activities", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgASportId,
        name: "Scoped Activity Sample",
        slug: testSlug("scoped-act"),
        activityType: "technical",
        howToPlay: "Demo instructions for the tenant-scoping test.",
      }),
    });
    const created = await expectJson(createRes, 201);
    expect(created.activity).toBeDefined();
    expect(created.activity.id).toBeTruthy();
    expect(created.activity.organizationId).toBeTruthy();
  });
});

// ----------------------------------------------------------------------------
// Templates (regression — was already scoped before PR #68)
// ----------------------------------------------------------------------------

describe("curriculum/templates — tenant scoping", () => {
  it("POST with cross-org sportId returns 403/404", async (ctx) => {
    if (!orgADevelopmentStageId) {
      ctx.skip();
      return;
    }
    const res = await apiFetch("/api/admin/curriculum/templates", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        sportId: orgBSportId,
        stageId: orgADevelopmentStageId,
        name: "Should be rejected",
        totalDurationMinutes: 60,
        structure: [],
      }),
    });
    expect([403, 404]).toContain(res.status);
  });
});
