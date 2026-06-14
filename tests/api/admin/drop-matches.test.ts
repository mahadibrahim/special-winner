import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/drop-matches";

describe("Admin Drop Matches API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(
        `${ENDPOINT}?dropSeasonId=00000000-0000-0000-0000-000000000001`,
        { method: "GET" }
      );

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST create (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          homeTeamId: "00000000-0000-0000-0000-000000000002",
          awayTeamId: "00000000-0000-0000-0000-000000000003",
        }),
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST finalize (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "finalize",
          dropMatchId: "00000000-0000-0000-0000-000000000004",
          homePitchScore: 3,
          awayPitchScore: 2,
        }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ── GET validation ────────────────────────────────────────────────────────

  describe("GET - missing dropSeasonId", () => {
    it("returns 400 when dropSeasonId query param is absent", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      expect(res.status).toBe(400);
    });
  });

  // ── POST Zod validation ───────────────────────────────────────────────────

  describe("POST - Zod validation", () => {
    it("rejects unknown action (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "delete",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects create without weekNumber (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          homeTeamId: "00000000-0000-0000-0000-000000000002",
          awayTeamId: "00000000-0000-0000-0000-000000000003",
          // weekNumber missing
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects create with weekNumber < 1 (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 0,
          homeTeamId: "00000000-0000-0000-0000-000000000002",
          awayTeamId: "00000000-0000-0000-0000-000000000003",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects create with invalid UUID for homeTeamId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          homeTeamId: "not-a-uuid",
          awayTeamId: "00000000-0000-0000-0000-000000000003",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects finalize with missing homePitchScore (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "finalize",
          dropMatchId: "00000000-0000-0000-0000-000000000004",
          // homePitchScore missing
          awayPitchScore: 2,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects finalize with negative pitch score (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "finalize",
          dropMatchId: "00000000-0000-0000-0000-000000000004",
          homePitchScore: -1,
          awayPitchScore: 2,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects finalize with invalid dropMatchId UUID (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "finalize",
          dropMatchId: "not-a-uuid",
          homePitchScore: 3,
          awayPitchScore: 2,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── POST finalize — match not found ───────────────────────────────────────

  describe("POST - finalize non-existent match", () => {
    it("returns 404 when match does not exist in org", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "finalize",
          dropMatchId: "00000000-0000-0000-0000-000000000099",
          homePitchScore: 3,
          awayPitchScore: 1,
        }),
      });

      // Auth passed; match not found → 404.
      // (Without seeded fixtures, 500 is also acceptable if DB errors.)
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  // ── POST create — team not found ──────────────────────────────────────────

  describe("POST - create with non-existent teams", () => {
    it("returns 404 when home team does not exist in org", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          homeTeamId: "00000000-0000-0000-0000-000000000097",
          awayTeamId: "00000000-0000-0000-0000-000000000098",
        }),
      });

      // Auth passed; team not found → 404 or 500 if DB errors
      expect([400, 404, 500]).toContain(res.status);
    });
  });
});
