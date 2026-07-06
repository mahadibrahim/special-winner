/**
 * Tenant + auth checks for the Phase 4 assessment-coverage report.
 * The endpoint is org-pinned via the teams -> seasons -> programs ->
 * locations.organizationId join; the tenancy assertion cross-checks the
 * returned team ids against /api/admin/teams (already org-scoped).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch,
  expectJson,
  getAdminCookie,
  getCoachCookie,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/curriculum/assessment-coverage";

describe("GET /api/admin/curriculum/assessment-coverage", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  it("returns 401 unauthenticated", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a coach (non-admin)", async () => {
    const coachCookie = await getCoachCookie();
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: coachCookie });
    expect(res.status).toBe(403);
  });

  it("returns the report shape for an admin", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);

    expect(typeof json.generatedAt).toBe("string");
    expect(Array.isArray(json.domains)).toBe(true);
    expect(Array.isArray(json.teams)).toBe(true);
    expect(Array.isArray(json.coaches)).toBe(true);

    for (const team of json.teams) {
      expect(team.teamId).toBeTruthy();
      // Status buckets partition the roster.
      expect(
        team.freshCount + team.dueCount + team.overdueCount + team.neverCount,
      ).toBe(team.rosterCount);
      expect(Array.isArray(team.neverAssessedPlayers)).toBe(true);
    }

    for (const coach of json.coaches) {
      expect(coach.coachUserId).toBeTruthy();
      // Distribution is display-only data: null or {count, mean, stdDev}.
      if (coach.levelDistribution !== null) {
        expect(typeof coach.levelDistribution.mean).toBe("number");
        expect(typeof coach.levelDistribution.stdDev).toBe("number");
        expect(coach.levelDistribution.count).toBeGreaterThan(0);
      }
    }
  });

  it("only returns teams belonging to the caller's org", async () => {
    // /api/admin/teams is already org-scoped (super-admin, org-pinned);
    // every coverage team must be in that set.
    const teamsRes = await apiFetch("/api/admin/teams", {
      method: "GET",
      cookie: adminCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    const orgTeamIds = new Set(
      (teamsJson.teams as Array<{ id: string }>).map((t) => t.id),
    );

    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    for (const team of json.teams) {
      expect(orgTeamIds.has(team.teamId)).toBe(true);
    }
  });
});
