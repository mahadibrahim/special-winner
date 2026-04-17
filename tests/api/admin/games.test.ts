import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/games";

describe("Admin Games CRUD API", () => {
  let adminCookie: string;
  let seasonId: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let venueId: string;
  let createdGameId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Fetch a season
    const seasonsRes = await apiFetch("/api/admin/seasons", {
      method: "GET",
      cookie: adminCookie,
    });
    const seasonsJson = await expectJson(seasonsRes, 200);
    expect(Array.isArray(seasonsJson.seasons)).toBe(true);
    expect(seasonsJson.seasons.length).toBeGreaterThan(0);
    const picked = seasonsJson.seasons.find((s: any) => s.status === "open") ?? seasonsJson.seasons[0];
    seasonId = picked.id;

    // Fetch teams — need at least two
    const teamsRes = await apiFetch("/api/admin/teams", {
      method: "GET",
      cookie: adminCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThanOrEqual(2);
    homeTeamId = teamsJson.teams[0].id;
    awayTeamId = teamsJson.teams[1].id;

    // Fetch a venue
    const venuesRes = await apiFetch("/api/admin/venues", {
      method: "GET",
      cookie: adminCookie,
    });
    const venuesJson = await expectJson(venuesRes, 200);
    expect(Array.isArray(venuesJson.venues)).toBe(true);
    expect(venuesJson.venues.length).toBeGreaterThan(0);
    venueId = venuesJson.venues[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- POST (Create) ----

  describe("POST - Create game", () => {
    it("creates a game with valid data (201)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          homeTeamId,
          awayTeamId,
          venueId,
          scheduledAt: "2026-09-15T10:00:00Z",
          durationMinutes: 60,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.game).toBeDefined();
      expect(json.game.seasonId).toBe(seasonId);
      expect(json.game.homeTeamId).toBe(homeTeamId);
      expect(json.game.awayTeamId).toBe(awayTeamId);
      expect(json.game.venueId).toBe(venueId);
      expect(json.game.durationMinutes).toBe(60);
      expect(json.game.id).toBeDefined();

      createdGameId = json.game.id;
    });
  });

  // ---- GET (List) ----

  describe("GET - List games", () => {
    it("returns array of games including the test one (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.games)).toBe(true);

      const found = json.games.find((g: any) => g.id === createdGameId);
      expect(found).toBeDefined();
    });
  });

  // ---- DELETE ----

  describe("DELETE - Delete game", () => {
    it("deletes the test game (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?id=${createdGameId}`, {
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
          homeTeamId,
          awayTeamId,
          venueId,
          scheduledAt: "2026-09-15T10:00:00Z",
          durationMinutes: 60,
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
