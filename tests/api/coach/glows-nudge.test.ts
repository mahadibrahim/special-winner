/**
 * Coach dashboard nudge for Glows & Grows (Plan 2 Task 7,
 * docs/superpowers/specs/2026-07-09-glows-and-grows-design.md §4).
 *
 * GET /api/coach/glows/nudge lists the coach's past (last 14 days),
 * non-draft/cancelled sessions that have zero coach_notes rows tied to
 * them yet — i.e. sessions still waiting on glows/grows. Once a coach
 * shares glows for a session, it must drop off the list.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachNotes, sessionPlans } from "@/lib/db/schema";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

describe("Coach glows nudge API", () => {
  let coachCookie: string;
  let parentCookie: string;
  let teamId: string;
  let sessionId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();

    const playersRes = await apiFetch("/api/coach/players", {
      method: "GET",
      cookie: coachCookie,
    });
    const playersJson = await expectJson(playersRes, 200);
    expect(playersJson.players.length).toBeGreaterThan(0);
    teamId = playersJson.players[0].team.id;

    const createRes = await apiFetch("/api/coach/sessions", {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId,
        title: "Glows nudge test session",
        scheduledDate: yesterday(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
    createdSessionIds.push(sessionId);
  });

  afterAll(async () => {
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));
    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }
    resetCookies();
  });

  it("lists a past planned session with no glow notes yet", async () => {
    const res = await apiFetch("/api/coach/glows/nudge", {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.pending)).toBe(true);

    const entry = json.pending.find((p: any) => p.sessionId === sessionId);
    expect(entry).toBeDefined();
    expect(entry.title).toBe("Glows nudge test session");
    expect(typeof entry.playerCount).toBe("number");
    expect(entry.playerCount).toBeGreaterThan(0);
  });

  it("drops the session from the list once glows have been shared for it", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    expect(bootstrap.roster.length).toBeGreaterThan(0);
    const universalGlow = bootstrap.chips.glows[0];
    const familyMemberId = bootstrap.roster[0].familyMemberId;

    const postRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId, glows: [universalGlow] }],
      }),
    });
    await expectJson(postRes, 201);

    const res = await apiFetch("/api/coach/glows/nudge", {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);
    const entry = json.pending.find((p: any) => p.sessionId === sessionId);
    expect(entry).toBeUndefined();
  });

  it("is forbidden for a parent", async () => {
    const res = await apiFetch("/api/coach/glows/nudge", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("is unauthorized without a session cookie", async () => {
    const res = await apiFetch("/api/coach/glows/nudge", { method: "GET" });
    expect(res.status).toBe(401);
  });
});
