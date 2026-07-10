import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("GET /api/coach/players/[playerId]/assessments teams payload (D3)", () => {
  let coachCookie: string;
  let playerId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    playerId = playersJson.players[0].id;
  });

  afterAll(() => resetCookies());

  it("includes the player's coach-visible teams with real names", async () => {
    const res = await apiFetch(`/api/coach/players/${playerId}/assessments`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.teams)).toBe(true);
    expect(json.teams.length).toBeGreaterThan(0);
    for (const team of json.teams) {
      expect(team.id).toBeTruthy();
      expect(team.name).toBeTruthy();
      expect(team.name).not.toBe("Current Team");
      expect(team.sport?.id).toBeTruthy();
      expect(team.sport?.name).toBeTruthy();
      expect(team.sport?.name).not.toBe("Sport");
    }
  });
});
