import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach Games & Scores API", () => {
  let coachCookie: string;
  let teamId: string;
  let games: any[] = [];
  let completedGameId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    // Get coach teams
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;

    // Fetch games for the first team
    const gamesRes = await apiFetch(`/api/coach/teams/${teamId}/games`, {
      method: "GET",
      cookie: coachCookie,
    });
    const gamesJson = await expectJson(gamesRes, 200);
    games = gamesJson.games || [];

    // Find a completed game for score update test
    const completed = games.find((g: any) => g.status === "completed");
    completedGameId = completed?.id || null;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Games ----

  describe("GET /api/coach/teams/:teamId/games", () => {
    it("returns games array for a valid team (200)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.games)).toBe(true);

      // If games exist, check shape
      if (json.games.length > 0) {
        const game = json.games[0];
        expect(game.id).toBeDefined();
        expect(game.status).toBeDefined();
        expect(typeof game.isHome).toBe("boolean");
      }
    });
  });

  // ---- Score update ----

  describe("PUT /api/coach/games/:gameId/score", () => {
    it("updates score for a completed game (200)", async () => {
      if (!completedGameId) {
        // No completed game available; skip gracefully
        console.log(
          "Skipping score update test: no completed game found for this team"
        );
        return;
      }

      const res = await apiFetch(`/api/coach/games/${completedGameId}/score`, {
        method: "PUT",
        cookie: coachCookie,
        body: JSON.stringify({
          homeScore: 3,
          awayScore: 1,
          status: "completed",
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.game).toBeDefined();
      expect(json.game.homeScore).toBe(3);
      expect(json.game.awayScore).toBe(1);
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET /api/coach/teams/:teamId/games (401)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated PUT /api/coach/games/:gameId/score (401)", async () => {
      // Use a placeholder ID; the auth check should reject before any DB lookup
      const res = await apiFetch(
        `/api/coach/games/00000000-0000-0000-0000-000000000000/score`,
        {
          method: "PUT",
          body: JSON.stringify({
            homeScore: 1,
            awayScore: 0,
          }),
        }
      );

      expect(res.status).toBe(401);
    });
  });
});
