import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

// D2 (Plan 3): the coach portal is read-only for games — match results are
// entered by the referee closeout flow. PUT /api/coach/games/[gameId]/score
// was deleted; this suite keeps the read coverage and pins the deletion.
describe("Coach Games API (read-only)", () => {
  let coachCookie: string;
  let teamId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  describe("GET /api/coach/teams/:teamId/games", () => {
    it("returns games array for a valid team (200)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.games)).toBe(true);

      if (json.games.length > 0) {
        const game = json.games[0];
        expect(game.id).toBeDefined();
        expect(game.status).toBeDefined();
        expect(typeof game.isHome).toBe("boolean");
      }
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("removed coach score entry", () => {
    it("PUT /api/coach/games/:gameId/score no longer exists (404)", async () => {
      const res = await apiFetch(
        `/api/coach/games/00000000-0000-0000-0000-000000000000/score`,
        {
          method: "PUT",
          cookie: coachCookie,
          body: JSON.stringify({ homeScore: 1, awayScore: 0 }),
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
