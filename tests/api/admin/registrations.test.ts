import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/registrations";

describe("Admin Registrations API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET (List with pagination) ----

  describe("GET - List registrations", () => {
    it("lists registrations with pagination (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.registrations)).toBe(true);
      expect(json.pagination).toBeDefined();
      expect(json.pagination).toHaveProperty("limit");
      expect(json.pagination).toHaveProperty("offset");
      expect(json.pagination).toHaveProperty("hasMore");
      expect(json.summary).toBeDefined();
    });

    it("filters by search term (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?search=Test`, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.registrations)).toBe(true);
      expect(json.pagination).toBeDefined();
    });

    it("filters by status (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?status=confirmed`, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.registrations)).toBe(true);
      // Every returned registration should have the requested status
      for (const reg of json.registrations) {
        expect(reg.status).toBe("confirmed");
      }
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });
});
