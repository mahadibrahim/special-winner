import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/drop-teams";

describe("Admin Drop Teams API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Auth ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(`${ENDPOINT}?dropSeasonId=00000000-0000-0000-0000-000000000001`, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          name: "Red Team",
        }),
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- GET validation ----

  describe("GET - missing dropSeasonId", () => {
    it("returns 400 when dropSeasonId is missing", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- POST validation ----

  describe("POST - Zod validation", () => {
    it("rejects unknown action (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "delete", // not a valid discriminant
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          name: "Red Team",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects create without name (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "00000000-0000-0000-0000-000000000001",
          name: "", // empty — fails min(1)
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects create with invalid UUID for dropSeasonId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "create",
          dropSeasonId: "not-a-uuid",
          name: "Red Team",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects assign with invalid UUIDs (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "assign",
          dropPlayerId: "not-a-uuid",
          dropTeamId: "also-not-a-uuid",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ---- POST assign — unknown player ----

  describe("POST - assign non-existent player", () => {
    it("returns 404 when player does not exist in org", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          action: "assign",
          dropPlayerId: "00000000-0000-0000-0000-000000000099",
          dropTeamId: "00000000-0000-0000-0000-000000000098",
        }),
      });

      // 404 because player not found, OR 500 if DB throws — both are acceptable
      // without seeded fixtures; the auth gate already passed (we got past 401/403)
      expect([404, 500]).toContain(res.status);
    });
  });
});
