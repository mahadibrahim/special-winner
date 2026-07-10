import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach POST validation (D6)", () => {
  let coachCookie: string;
  let teamId: string;
  let rosterId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    for (const team of teamsJson.teams) {
      const rosterRes = await apiFetch(`/api/coach/teams/${team.id}/roster`, {
        method: "GET",
        cookie: coachCookie,
      });
      const rosterJson = await rosterRes.json();
      if (rosterJson.roster?.length > 0) {
        teamId = team.id;
        rosterId = rosterJson.roster[0].id;
        break;
      }
    }
    if (!teamId) teamId = teamsJson.teams[0].id;
  });

  afterAll(() => resetCookies());

  it("404s dismissing a nonexistent prompt", async () => {
    const res = await apiFetch("/api/coach/prompts", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ promptId: randomUUID(), dismissType: "temporary" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s a non-uuid promptId", async () => {
    const res = await apiFetch("/api/coach/prompts", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ promptId: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s recording a view on a nonexistent resource", async () => {
    const res = await apiFetch("/api/coach/resources", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ resourceId: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  it("400s an out-of-range resource rating", async () => {
    const res = await apiFetch("/api/coach/resources", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ resourceId: randomUUID(), rating: 9 }),
    });
    expect(res.status).toBe(400);
  });

  it("whole-batch rejects bulk attendance containing a foreign rosterId (400)", async () => {
    const res = await apiFetch("/api/coach/attendance", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        eventDate: new Date("2026-06-02T10:00:00Z").toISOString(),
        eventType: "practice",
        records: [
          ...(rosterId ? [{ rosterId, status: "present" }] : []),
          { rosterId: randomUUID(), status: "present" },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400s a PUT with an invalid status", async () => {
    const res = await apiFetch("/api/coach/attendance", {
      method: "PUT",
      cookie: coachCookie,
      body: JSON.stringify({ id: randomUUID(), status: "vibing" }),
    });
    expect(res.status).toBe(400);
  });
});
