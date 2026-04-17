import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach Teams & Roster API", () => {
  let coachCookie: string;
  let teamId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    // Fetch coach teams to grab the first team ID for roster tests
    const res = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.teams)).toBe(true);
    expect(json.teams.length).toBeGreaterThan(0);
    teamId = json.teams[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Teams ----

  describe("GET /api/coach/teams", () => {
    it("returns teams array for authenticated coach (200)", async () => {
      const res = await apiFetch("/api/coach/teams", {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.teams)).toBe(true);
      expect(json.teams.length).toBeGreaterThan(0);

      // Each team should have expected shape
      const team = json.teams[0];
      expect(team.id).toBeDefined();
      expect(team.name).toBeDefined();
      expect(typeof team.isHeadCoach).toBe("boolean");
      expect(typeof team.rosterCount).toBe("number");
    });
  });

  // ---- Roster ----

  describe("GET /api/coach/teams/:teamId/roster", () => {
    it("returns roster array for a valid team (200)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/roster`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.roster)).toBe(true);
      expect(json.team).toBeDefined();
      expect(json.team.id).toBe(teamId);
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET /api/coach/teams (401)", async () => {
      const res = await apiFetch("/api/coach/teams", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
