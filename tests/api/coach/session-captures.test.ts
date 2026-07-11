import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessionPlans, attendance } from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import {
  getCoachCookie, apiFetch, expectJson, resetCookies,
} from "../setup/test-helpers";

describe("POST /api/coach/sessions/[id]/captures", () => {
  let coachCookie: string;
  let sessionId: string;
  let rosterId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const playersJson = await expectJson(
      await apiFetch("/api/coach/players", { method: "GET", cookie: coachCookie }), 200);
    const teamId = playersJson.players[0].team.id;

    const created = await expectJson(
      await apiFetch("/api/coach/sessions", {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          teamId, title: "Captures test", scheduledDate: new Date().toISOString(),
          durationMinutes: 60, status: "planned",
          segments: [{ order: 0, name: "Main", type: "technical", durationMinutes: 60 }],
        }),
      }), 201);
    sessionId = created.session.id;

    // Session creation only accepts draft|planned (createSessionSchema);
    // in_progress is reached via the PUT transition endpoint, same as
    // sessions-transitions.test.ts.
    await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}`, {
        method: "PUT", cookie: coachCookie, body: JSON.stringify({ status: "in_progress" }),
      }), 200);

    const live = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/live`, {
        method: "GET", cookie: coachCookie,
      }), 200);
    expect(live.roster.length).toBeGreaterThan(0);
    rosterId = live.roster[0].rosterId;
  });

  afterAll(async () => {
    if (sessionId) {
      await getDb().delete(sessionCaptures).where(eq(sessionCaptures.sessionPlanId, sessionId));
      await getDb().delete(attendance).where(eq(attendance.sessionPlanId, sessionId));
      await getDb().delete(sessionPlans).where(eq(sessionPlans.id, sessionId));
    }
    resetCookies();
  });

  it("writes captures + attendance; replaying the envelope is idempotent", async () => {
    const clientId = randomUUID();
    const envelope = {
      captures: [{ clientId, rosterId, kind: "glow", skillId: null, note: "great hustle" }],
      attendance: [{ rosterId, status: "present" }],
      consumedClientIds: [],
    };

    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie, body: JSON.stringify(envelope),
      }), 201);
    expect(first.captures).toHaveLength(1);
    expect(first.captures[0].clientId).toBe(clientId);
    expect(first.attendanceUpdated).toBe(1);

    const second = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie, body: JSON.stringify(envelope),
      }), 201);
    expect(second.captures[0].id).toBe(first.captures[0].id); // same row, no dup

    const rows = await getDb()
      .select()
      .from(sessionCaptures)
      .where(eq(sessionCaptures.sessionPlanId, sessionId));
    expect(rows).toHaveLength(1);

    const attRows = await getDb()
      .select()
      .from(attendance)
      .where(eq(attendance.sessionPlanId, sessionId));
    expect(attRows).toHaveLength(1);
    expect(attRows[0].status).toBe("present");
  });

  it("consumedClientIds stamps consumedAt", async () => {
    const clientId = randomUUID();
    await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          captures: [{ clientId, rosterId, kind: "observation", note: "left foot" }],
        }),
      }), 201);
    const res = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({ consumedClientIds: [clientId] }),
      }), 201);
    expect(res.consumed).toBe(1);
  });

  it("replaying consumedClientIds leaves consumedAt unchanged", async () => {
    const clientId = randomUUID();
    await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({
          captures: [{ clientId, rosterId, kind: "glow", note: "replay guard" }],
        }),
      }), 201);
    const first = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({ consumedClientIds: [clientId] }),
      }), 201);
    expect(first.consumed).toBe(1);

    const [afterFirst] = await getDb()
      .select({ consumedAt: sessionCaptures.consumedAt })
      .from(sessionCaptures)
      .where(and(
        eq(sessionCaptures.sessionPlanId, sessionId),
        eq(sessionCaptures.clientId, clientId),
      ));
    expect(afterFirst.consumedAt).toBeTruthy();

    const replay = await expectJson(
      await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST", cookie: coachCookie,
        body: JSON.stringify({ consumedClientIds: [clientId] }),
      }), 201);
    // The endpoint reports the full match count on every retry (the client
    // just needs "yes, this capture is consumed"), but the write is
    // null-guarded — the original consumedAt timestamp survives the replay.
    expect(replay.consumed).toBe(1);

    const [afterReplay] = await getDb()
      .select({ consumedAt: sessionCaptures.consumedAt })
      .from(sessionCaptures)
      .where(and(
        eq(sessionCaptures.sessionPlanId, sessionId),
        eq(sessionCaptures.clientId, clientId),
      ));
    expect(afterReplay.consumedAt!.getTime()).toBe(afterFirst.consumedAt!.getTime());
  });

  it("rejects the whole batch when any roster is off-team (nothing written)", async () => {
    const offTeamClientId = randomUUID();
    const onTeamClientId = randomUUID();
    const res = await apiFetch(`/api/coach/sessions/${sessionId}/captures`, {
      method: "POST", cookie: coachCookie,
      body: JSON.stringify({
        captures: [
          { clientId: onTeamClientId, rosterId, kind: "glow" },
          { clientId: offTeamClientId, rosterId: "00000000-0000-4000-8000-000000000000", kind: "glow" },
        ],
      }),
    });
    expect(res.status).toBe(400);

    // Whole-batch reject: neither capture row was written — not even the
    // valid on-team one.
    const rows = await getDb()
      .select({ clientId: sessionCaptures.clientId })
      .from(sessionCaptures)
      .where(eq(sessionCaptures.sessionPlanId, sessionId));
    const written = rows.map((r) => r.clientId);
    expect(written).not.toContain(onTeamClientId);
    expect(written).not.toContain(offTeamClientId);
  });
});
