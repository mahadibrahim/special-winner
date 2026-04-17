import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const SESSIONS_ENDPOINT = "/api/coach/sessions";

describe("Coach Practice Sessions API", () => {
  let coachCookie: string;
  let teamId: string;
  let createdSessionId: string | null = null;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    // Fetch coach teams to get a teamId
    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET (List) ----

  describe("GET /api/coach/sessions", () => {
    it("returns sessions list for authenticated coach (200)", async () => {
      const res = await apiFetch(SESSIONS_ENDPOINT, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.sessions)).toBe(true);
      expect(Array.isArray(json.teams)).toBe(true);
    });

    it("returns sessions filtered by teamId (200)", async () => {
      const res = await apiFetch(`${SESSIONS_ENDPOINT}?teamId=${teamId}`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.sessions)).toBe(true);
      // All returned sessions should belong to the requested team
      for (const session of json.sessions) {
        expect(session.teamId).toBe(teamId);
      }
    });
  });

  // ---- POST (Create) ----

  describe("POST /api/coach/sessions", () => {
    it("creates a new practice session (201)", async () => {
      const res = await apiFetch(SESSIONS_ENDPOINT, {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          title: "Test Practice",
          scheduledDate: "2026-06-01T16:00:00.000Z",
          durationMinutes: 90,
        }),
      });

      const json = await expectJson(res, 201);
      expect(json.session).toBeDefined();
      expect(json.session.title).toBe("Test Practice");
      expect(json.session.durationMinutes).toBe(90);
      expect(json.session.teamId).toBe(teamId);
      expect(json.session.status).toBe("draft");
      expect(json.session.id).toBeDefined();

      createdSessionId = json.session.id;
    });

    it("returns 400 for missing required fields", async () => {
      const res = await apiFetch(SESSIONS_ENDPOINT, {
        method: "POST",
        cookie: coachCookie,
        body: JSON.stringify({
          teamId,
          // missing title, scheduledDate, durationMinutes
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- GET (Single) ----

  describe("GET /api/coach/sessions/:id", () => {
    it("returns a single session by id (200)", async () => {
      // Skip if session was not created
      if (!createdSessionId) {
        console.warn("Skipping single-session test: no session was created");
        return;
      }

      const res = await apiFetch(`${SESSIONS_ENDPOINT}/${createdSessionId}`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.session).toBeDefined();
      expect(json.session.id).toBe(createdSessionId);
      expect(json.session.title).toBe("Test Practice");
      expect(json.session.durationMinutes).toBe(90);
    });
  });

  // ---- Unauthenticated ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET /api/coach/sessions (401)", async () => {
      const res = await apiFetch(SESSIONS_ENDPOINT, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/coach/sessions (401)", async () => {
      const res = await apiFetch(SESSIONS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          teamId: "00000000-0000-0000-0000-000000000000",
          title: "Unauth Session",
          scheduledDate: "2026-06-01T16:00:00.000Z",
          durationMinutes: 60,
        }),
      });

      expect(res.status).toBe(401);
    });
  });
});
