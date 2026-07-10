import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
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

  it("404s a create referencing an invisible/nonexistent template", async () => {
    const res = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        templateId: randomUUID(),
        title: "Bad template session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("400s a PUT whose segments reference an invisible activity", async () => {
    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Segment validation session",
        scheduledDate: new Date("2026-08-01T17:00:00Z").toISOString(),
        durationMinutes: 60,
      }),
    });
    const created = await expectJson(createRes, 201);
    createdSessionIds.push(created.session.id);

    const putRes = await apiFetch(`/api/coach/sessions/${created.session.id}`, {
      method: "PUT",
      cookie: coachCookie,
      body: JSON.stringify({
        segments: [
          {
            order: 0,
            name: "Warmup",
            type: "warmup",
            durationMinutes: 10,
            activityId: randomUUID(),
          },
        ],
      }),
    });
    expect(putRes.status).toBe(400);
  });
});
