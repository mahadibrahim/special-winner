import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach sessions validation (D4/D6)", () => {
  let coachCookie: string;
  let teamId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;
  });

  afterAll(async () => {
    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }
    resetCookies();
  });

  it("honors status: planned on create", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Status test session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const json = await expectJson(res, 201);
    createdSessionIds.push(json.session.id);
    expect(json.session.status).toBe("planned");
  });

  it("rejects a status outside draft|planned (400)", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Bad status session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "completed",
      }),
    });
    expect(res.status).toBe(400);
  });
});
