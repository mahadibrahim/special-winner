import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  getParentCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/messages";

/**
 * Coach → parent messaging endpoint. Authorization-focused: the send
 * path itself delegates to the outbound gateway, which is covered by
 * the messaging suites; what matters here is that recipients can only
 * be addressed through a roster on a team the caller coaches.
 */
describe("POST /api/coach/messages", () => {
  let coachCookie: string;
  let coachTeamId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();
    const res = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    if (res.ok) {
      const json = await res.json();
      coachTeamId = json.teams?.[0]?.id ?? null;
    }
  });

  afterAll(() => {
    resetCookies();
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        teamId: "00000000-0000-0000-0000-000000000000",
        rosterIds: "all",
        body: "hello",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("400s on invalid body", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ teamId: "not-a-uuid", rosterIds: "all", body: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("403s when the caller does not coach the team", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        teamId:
          coachTeamId ?? "00000000-0000-0000-0000-000000000000",
        rosterIds: "all",
        body: "hello",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("403s for a coach addressing a team they do not coach", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId: "00000000-0000-0000-0000-000000000000",
        rosterIds: "all",
        body: "hello",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("sends (or cleanly reports per-recipient failure) to own roster", async () => {
    if (!coachTeamId) return; // fixture team not present — skip
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId: coachTeamId,
        rosterIds: "all",
        body: "Test message from the coach messaging suite.",
      }),
    });
    // Roster may be empty in some seeds → 404; otherwise a 200 with
    // per-recipient accounting (sends can fail without configured
    // channels in CI — that's still a structured 200).
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const json = await expectJson(res, 200);
      expect(typeof json.sentCount).toBe("number");
      expect(typeof json.failedCount).toBe("number");
      expect(Array.isArray(json.failed)).toBe(true);
    }
  });

  it("403s when rosterIds include a row not on the team", async () => {
    if (!coachTeamId) return;
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        teamId: coachTeamId,
        rosterIds: ["00000000-0000-0000-0000-000000000000"],
        body: "hello",
      }),
    });
    expect([403, 404]).toContain(res.status);
  });
});
