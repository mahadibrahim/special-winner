import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/teams";

describe("Admin Teams CRUD API", () => {
  let adminCookie: string;
  let seasonId: string;
  let createdTeamId: string;
  const teamName = `Test Team ${Date.now()}`;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Fetch seasons to get one with status "open"
    const res = await apiFetch("/api/admin/seasons", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.seasons)).toBe(true);
    expect(json.seasons.length).toBeGreaterThan(0);

    const openSeason = json.seasons.find((s: any) => s.status === "open");
    // Fall back to any season if none are "open"
    const picked = openSeason ?? json.seasons[0];
    seasonId = picked.id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create team", () => {
    it("creates a team with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          name: teamName,
          color: "#FF5500",
          maxRosterSize: 15,
          division: "U10",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.team).toBeDefined();
      expect(json.team.name).toBe(teamName);
      expect(json.team.seasonId).toBe(seasonId);
      expect(json.team.color).toBe("#FF5500");
      expect(json.team.maxRosterSize).toBe(15);
      expect(json.team.division).toBe("U10");
      expect(json.team.id).toBeDefined();

      createdTeamId = json.team.id;
    });
  });

  // ---- GET (List) ----

  describe("GET - List teams", () => {
    it("returns array of teams including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.teams)).toBe(true);

      const found = json.teams.find((t: any) => t.id === createdTeamId);
      expect(found).toBeDefined();
      expect(found.name).toBe(teamName);
    });
  });

  // ---- GET (Single with roster) ----

  describe("GET - Single team with roster", () => {
    it("returns team and roster for a single team (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdTeamId}`, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.team).toBeDefined();
      expect(json.team.id).toBe(createdTeamId);
      expect(json.team.name).toBe(teamName);
      // The single-team response includes rosters array
      expect(Array.isArray(json.team.rosters)).toBe(true);
    });
  });

  // ---- PUT (Update) ----

  describe("PUT - Update team", () => {
    it("updates team name and color (200)", async () => {
      const updatedName = `${teamName} Updated`;
      const res = await apiFetch(ENDPOINT, {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: createdTeamId,
          seasonId,
          name: updatedName,
          color: "#00AAFF",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.team).toBeDefined();
      expect(json.team.name).toBe(updatedName);
      expect(json.team.color).toBe("#00AAFF");
      expect(json.team.id).toBe(createdTeamId);
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete team", () => {
    it("deletes the test team (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdTeamId}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.success).toBe(true);
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          seasonId,
          name: "Unauth Team",
        }),
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
