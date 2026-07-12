import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, sessionPlans, sports } from "@/lib/db/schema";
import {
  getCoachCookie, getParentCookie, apiFetch, expectJson, resetCookies,
} from "../setup/test-helpers";

describe("GET /api/coach/sessions/[id]/live", () => {
  let coachCookie: string;
  let parentCookie: string;
  let sessionId: string;
  let diagramActivity: { id: string; name: string; diagram: string | null };

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();
    const playersJson = await expectJson(
      await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie }), 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    const teamId = playersJson.players[0].team.id;

    // A fixture activity with a setup diagram — created here rather than
    // picked from the seed (the CI DB has no diagram-bearing activities;
    // staging does, so a seed-dependent pick passes locally and fails CI).
    const [sport] = await getDb()
      .select({ id: sports.id })
      .from(sports)
      .orderBy(asc(sports.name))
      .limit(1);
    expect(sport?.id).toBeTruthy();
    [diagramActivity] = await getDb()
      .insert(activities)
      .values({
        sportId: sport.id,
        name: "Live diagram fixture",
        slug: `live-diagram-fixture-${crypto.randomUUID().slice(0, 8)}`,
        durationMinutes: 10,
        howToPlay: "Fixture for the live payload diagram pass-through test.",
        diagram: "▲   ○●   ▲\n  10 paces\n▲=cone ○●=player with ball",
      })
      .returning({ id: activities.id, name: activities.name, diagram: activities.diagram });
    expect(diagramActivity?.diagram).toBeTruthy();

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
          segments: [
            { order: 0, name: "Warmup", type: "warmup", durationMinutes: 10 },
            {
              order: 1,
              name: "Main drill",
              type: "technical",
              durationMinutes: 15,
              activityId: diagramActivity.id,
              activityName: diagramActivity.name,
            },
          ],
        }),
      }), 201);
    sessionId = created.session.id;
  });

  afterAll(async () => {
    if (sessionId) await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    if (diagramActivity?.id)
      await getDb().delete(activities).where(eq(activities.id, diagramActivity.id));
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
    // Segments carry the activity's setup diagram (drill visuals, owner
    // directive 2026-07-12): null without an activity, the DB value with one.
    expect(payload.segments[0].activityDiagram).toBeNull();
    expect(payload.segments[1].activityDiagram).toBe(diagramActivity.diagram);
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
