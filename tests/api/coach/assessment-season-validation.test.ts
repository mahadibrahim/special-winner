import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("POST /api/coach/assessments seasonId validation (D5)", () => {
  let coachCookie: string;
  let playerId: string;
  let skillId: string | null = null;
  let realSeasonId: string | undefined;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    playerId = player.id;
    realSeasonId = player.team?.season?.id;

    const skillsRes = await apiFetch(
      `/api/coach/skills?sportId=${player.team.sport.id}`,
      { method: "GET", cookie: coachCookie }
    );
    const skillsJson = await expectJson(skillsRes, 200);
    expect(skillsJson.skills.length).toBeGreaterThan(0);
    if (skillsJson.skills?.length > 0) skillId = skillsJson.skills[0].id;
  });

  afterAll(() => resetCookies());

  it("rejects a seasonId that no coach team plays in (400)", async () => {
    if (!skillId) return console.warn("Skipping: no skills loaded");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId: playerId,
        skillId,
        level: 3,
        seasonId: randomUUID(),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts the coach team's real seasonId (201)", async () => {
    if (!skillId || !realSeasonId) return console.warn("Skipping: fixtures missing");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId: playerId,
        skillId,
        level: 3,
        seasonId: realSeasonId,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.assessment.seasonId).toBe(realSeasonId);
  });

  it("still accepts an assessment without seasonId (201)", async () => {
    if (!skillId) return console.warn("Skipping: no skills loaded");
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ familyMemberId: playerId, skillId, level: 3 }),
    });
    await expectJson(res, 201);
  });
});
