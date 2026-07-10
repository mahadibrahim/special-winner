import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachNotes } from "@/lib/db/schema";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Coach Glows & Grows API", () => {
  let coachCookie: string;
  let parentCookie: string;
  let teamId: string;
  let sessionId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    parentCookie = await getParentCookie();

    // Pick a team that actually has an active roster (not just any of the
    // coach's teams) — the roster whole-batch checks below need at least
    // one real familyMemberId to submit against.
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
        title: "Glows & Grows test session",
        scheduledDate: new Date("2026-08-05T17:00:00Z").toISOString(),
        durationMinutes: 60,
        status: "planned",
      }),
    });
    const created = await expectJson(createRes, 201);
    sessionId = created.session.id;
    createdSessionIds.push(sessionId);
  });

  afterAll(async () => {
    // Clean up any coach_notes written to this session directly via the DB
    // (in case a test failed before the API-level cleanup below ran).
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));

    for (const id of createdSessionIds) {
      await apiFetch(`/api/coach/sessions/${id}`, {
        method: "DELETE",
        cookie: coachCookie,
      });
    }
    resetCookies();
  });

  it("GET returns the bootstrap payload: session, roster, chips, existingNotes", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const json = await expectJson(res, 200);

    expect(json.session.id).toBe(sessionId);
    expect(json.session.team.id).toBe(teamId);
    expect(Array.isArray(json.roster)).toBe(true);
    expect(Array.isArray(json.chips.glows)).toBe(true);
    // Universal glows are always present, even for a session with no
    // segments/activities wired up yet.
    expect(json.chips.glows.length).toBeGreaterThan(0);
    expect(Array.isArray(json.existingNotes)).toBe(true);
  });

  it("GET as a parent is forbidden", async () => {
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("POST happy path writes glow/grow notes visible to parents and reflects in existingNotes", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    expect(bootstrap.roster.length).toBeGreaterThan(0);

    const universalGlow = bootstrap.chips.glows[0];
    const grow = bootstrap.chips.grows[0]; // may be undefined for a chip-less session

    const players = bootstrap.roster.slice(0, Math.min(2, bootstrap.roster.length));
    const entries = players.map((p: any, i: number) => ({
      familyMemberId: p.familyMemberId,
      glows: [universalGlow],
      ...(i === 0 && grow ? { grow } : {}),
      note: "Great session overall.",
    }));

    const postRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ entries }),
    });
    const postJson = await expectJson(postRes, 201);
    expect(postJson.created.length).toBe(entries.length);
    for (const c of postJson.created) {
      expect(c.noteIds.length).toBeGreaterThan(0);
    }

    const afterRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const afterJson = await expectJson(afterRes, 200);
    expect(afterJson.existingNotes.length).toBeGreaterThanOrEqual(entries.length);

    // Direct DB check: rows are parent-visible and tagged to this session.
    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visibleToParent).toBe(true);
      expect(row.sessionPlanId).toBe(sessionId);
    }

    // Clean up what this test wrote so later tests in this file start clean.
    await getDb().delete(coachNotes).where(eq(coachNotes.sessionPlanId, sessionId));
  });

  it("POST with a made-up chip label is rejected and writes zero rows", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const familyMemberId = bootstrap.roster[0].familyMemberId;

    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId, glows: ["Definitely not a real chip"] }],
      }),
    });
    expect(res.status).toBe(400);

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBe(0);
  });

  it("POST with a foreign familyMemberId mixed into a valid batch is rejected and writes zero rows", async () => {
    const bootstrapRes = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "GET",
      cookie: coachCookie,
    });
    const bootstrap = await expectJson(bootstrapRes, 200);
    const validFamilyMemberId = bootstrap.roster[0].familyMemberId;
    const universalGlow = bootstrap.chips.glows[0];

    const res = await apiFetch(`/api/coach/sessions/${sessionId}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [
          { familyMemberId: validFamilyMemberId, glows: [universalGlow] },
          { familyMemberId: randomUUID(), glows: [universalGlow] },
        ],
      }),
    });
    expect(res.status).toBe(400);

    const rows = await getDb()
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.sessionPlanId, sessionId));
    expect(rows.length).toBe(0);
  });

  it("POST to a session the coach doesn't own (nonexistent id) is forbidden", async () => {
    const res = await apiFetch(`/api/coach/sessions/${randomUUID()}/glows`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        entries: [{ familyMemberId: randomUUID(), glows: ["Great effort today"] }],
      }),
    });
    expect([403, 404]).toContain(res.status);
  });
});
