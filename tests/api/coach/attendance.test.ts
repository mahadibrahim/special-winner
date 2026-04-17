import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/coach/attendance";

describe("Coach Attendance API", () => {
  let coachCookie: string;
  let teamId: string;
  let rosterId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    // Fetch coach teams
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThan(0);

    // Try each team until we find one with roster members
    for (const team of teamsJson.teams) {
      const rosterRes = await apiFetch(
        `/api/coach/teams/${team.id}/roster`,
        { method: "GET", cookie: coachCookie }
      );
      const rosterJson = await rosterRes.json();

      if (
        rosterJson.roster &&
        Array.isArray(rosterJson.roster) &&
        rosterJson.roster.length > 0
      ) {
        teamId = team.id;
        rosterId = rosterJson.roster[0].id;
        break;
      }
    }

    // Fall back to the first team even if roster is empty (for GET tests)
    if (!teamId) {
      teamId = teamsJson.teams[0].id;
    }
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET ----

  describe("GET /api/coach/attendance", () => {
    it("returns attendance data for a team (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.team).toBeDefined();
      expect(json.team.id).toBe(teamId);
      expect(Array.isArray(json.roster)).toBe(true);
      expect(Array.isArray(json.attendance)).toBe(true);
      expect(Array.isArray(json.stats)).toBe(true);
    });

    it("returns 400 when teamId is missing", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: coachCookie,
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- POST ----

  describe("POST /api/coach/attendance", () => {
    it("records a single attendance entry (201)", async () => {
      if (!rosterId) {
        console.warn(
          "Skipping attendance POST test: no roster members found on any coach team"
        );
        return;
      }

      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          rosterId,
          eventDate: new Date("2026-06-01T10:00:00Z").toISOString(),
          eventType: "practice",
          status: "present",
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.attendance).toBeDefined();
      expect(json.attendance.teamId).toBe(teamId);
      expect(json.attendance.rosterId).toBe(rosterId);
      expect(json.attendance.eventType).toBe("practice");
      expect(json.attendance.status).toBe("present");
    });

    it("returns 400 for invalid body", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          // missing required fields
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(`${ENDPOINT}?teamId=${teamId}`, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          teamId,
          rosterId: rosterId || "00000000-0000-0000-0000-000000000000",
          eventDate: new Date("2026-06-01T10:00:00Z").toISOString(),
          eventType: "practice",
          status: "present",
        }),
      });

      expect(res.status).toBe(401);
    });
  });
});
