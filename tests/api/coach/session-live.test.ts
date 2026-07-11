import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans } from "@/lib/db/schema";
import {
  getCoachCookie, getParentCookie, apiFetch, expectJson, resetCookies,
} from "../setup/test-helpers";

describe("GET /api/coach/sessions/[id]/live", () => {
  let coachCookie: string;
  let parentCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    const playersJson = await expectJson(
      await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie }), 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    const teamId = playersJson.players[0].team.id;

    const created = await expectJson(
      await apiFetch("/api/coach/sessions", {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          title: "Live payload test",
          scheduledDate: new Date().toISOString(),
          durationMinutes: 60,
          status: "planned",
          equipmentNeeded: ["Cones"],
          objectives: ["First touch"],
          segments: [{ order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 }],
        }),
      }), 201);
    sessionId = created.session.id;
  });

  afterAll(async () => {
    if (sessionId) await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    resetCookies();
  });

  it("returns the composite payload in one round trip", async () => {
    const payload = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
        method: "GET", cookie: coachCookie,
      }), 200);

    expect(payload.session.id).toBe(sessionId);
    expect(payload.session.status).toBe("planned");
    expect(payload.session.groupNoun).toBeTruthy();
    expect(payload.session.prescribed).toBeNull();
    expect(payload.equipment).toContain("Cones");
    expect(Array.isArray(payload.segments)).toBe(true);
    expect(payload.segments[0].activitySkillIds).toEqual([]);
    expect(Array.isArray(payload.prompts)).toBe(true);
    expect(Array.isArray(payload.roster)).toBe(true);
    expect(payload.roster.length).toBeGreaterThan(0);
    expect(payload.roster[0].rosterId).toBeTruthy();
    expect(payload.roster[0].familyMemberId).toBeTruthy();
    expect(payload.glowChips.glows.length).toBeGreaterThan(0);
    expect(payload.captures).toEqual([]);
  });

  it("403s a non-coach of the team", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
      method: "GET", cookie: parentCookie,
    });
    expect([401, 403]).toContain(res.status);
  });

  it("404s an unknown session", async () => {
    const res = await apiFetch(
      `/api/coach/sessions/00000000-0000-4000-8000-000000000000/live`,
      { method: "GET", cookie: coachCookie },
    );
    expect([403, 404]).toContain(res.status);
  });
});
