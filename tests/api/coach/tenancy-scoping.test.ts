import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach curriculum read scoping (D6)", () => {
  let coachCookie: string;
  let parentCookie: string;
  let sportId: string;
  let playerId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    const player = playersJson.players.find((p: any) => p.team?.sport?.id);
    expect(player).toBeDefined();
    sportId = player.team.sport.id;
    playerId = player.id;
  });

  afterAll(() => resetCookies());

  it("rejects a non-coach on GET /api/coach/skills (403)", async () => {
    const res = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-coach on GET /api/coach/activities (403)", async () => {
    const res = await apiFetch("/api/coach/activities", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-coach on GET /api/coach/templates (403)", async () => {
    const res = await apiFetch("/api/coach/templates", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("still serves skills to a coach (200)", async () => {
    const res = await apiFetch(`/api/coach/skills?sportId=${sportId}`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.skills)).toBe(true);
    expect(json.skills.length).toBeGreaterThan(0);
  });

  it("rejects POST /api/coach/assessments with a random-UUID skillId (404, not 500/201)", async () => {
    const res = await apiFetch("/api/coach/assessments", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        familyMemberId: playerId,
        skillId: randomUUID(),
        level: 3,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid startDate on GET /api/coach/sessions (400)", async () => {
    const res = await apiFetch("/api/coach/sessions?startDate=not-a-date", {
      method: "GET",
      cookie: coachCookie,
    });
    expect(res.status).toBe(400);
  });
});
