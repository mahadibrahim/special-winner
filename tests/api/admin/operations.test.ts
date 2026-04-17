import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Admin Operations API (Smoke Tests)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Waitlist ----

  describe("GET /api/admin/waitlist", () => {
    it("returns 200 with waitlist data", async () => {
      const res = await apiFetch("/api/admin/waitlist", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.waitlist).toBeDefined();
      expect(Array.isArray(json.waitlist)).toBe(true);
      expect(json.seasons).toBeDefined();
      expect(Array.isArray(json.seasons)).toBe(true);
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/waitlist", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Walk-Up Registration (POST only) ----

  describe("POST /api/admin/walk-up-registration", () => {
    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/walk-up-registration", {
        method: "POST",
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it("rejects invalid body with 400", async () => {
      const res = await apiFetch("/api/admin/walk-up-registration", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({}),
      });

      const json = await expectJson(res, 400);
      expect(json.error).toBeDefined();
    });
  });
});
