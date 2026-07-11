import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans } from "@/lib/db/schema";
import { getCoachCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Session lifecycle transitions", () => {
  let coachCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersRes = await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    const teamId = playersJson.players[0].team.id;

    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Transitions test session",
        scheduledDate: new Date().toISOString(),
        durationMinutes: 60,
        status: "planned",
        segments: [
          { order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 },
          { order: 1, name: "Main", type: "technical", durationMinutes: 50 },
        ],
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
  });

  afterAll(async () => {
    if (sessionId) await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    resetCookies();
  });

  it("in_progress stamps startedAt once; retry is a no-op", async () => {
    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "in_progress" }),
      }), 200);
    expect(first.session.startedAt).toBeTruthy();

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "in_progress" }),
      }), 200);
    expect(second.session.startedAt).toBe(first.session.startedAt);
  });

  it("completed stamps completedAt once; retry does not move it", async () => {
    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "completed" }),
      }), 200);
    expect(first.session.completedAt).toBeTruthy();

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "completed" }),
      }), 200);
    expect(second.session.completedAt).toBe(first.session.completedAt);
  });
});
