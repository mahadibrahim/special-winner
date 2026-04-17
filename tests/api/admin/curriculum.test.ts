import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Admin Curriculum API (Smoke Tests)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Skills ----

  describe("GET /api/admin/curriculum/skills", () => {
    it("returns 200 with skills array", async () => {
      const res = await apiFetch("/api/admin/curriculum/skills", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.skills).toBeDefined();
      expect(Array.isArray(json.skills)).toBe(true);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/curriculum/skills", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Activities ----

  describe("GET /api/admin/curriculum/activities", () => {
    it("returns 200 with activities array", async () => {
      const res = await apiFetch("/api/admin/curriculum/activities", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.activities).toBeDefined();
      expect(Array.isArray(json.activities)).toBe(true);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/curriculum/activities", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Templates ----

  describe("GET /api/admin/curriculum/templates", () => {
    it("returns 200 with templates array", async () => {
      const res = await apiFetch("/api/admin/curriculum/templates", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.templates).toBeDefined();
      expect(Array.isArray(json.templates)).toBe(true);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/curriculum/templates", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
