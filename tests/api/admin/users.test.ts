import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/users";

describe("Admin Users API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET (List) ----

  describe("GET - List users", () => {
    it("lists users (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.users)).toBe(true);
      expect(json.users.length).toBeGreaterThanOrEqual(1);
      expect(json.users[0]).toHaveProperty("email");
    });

    it("searches users by name 'Test' (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?search=Test`, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.users)).toBe(true);
      // Every returned user should match the search term in name or email
      for (const user of json.users) {
        const haystack = `${user.firstName ?? ""} ${user.lastName ?? ""} ${user.email}`.toLowerCase();
        expect(haystack).toContain("test");
      }
    });

    it("searches users by email substring (200)", async () => {
      const res = await apiFetch(`${ENDPOINT}?search=aspiresports.com`, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.users)).toBe(true);
      expect(json.users.length).toBeGreaterThanOrEqual(1);
      // Every returned user should have the email domain in their email
      for (const user of json.users) {
        expect(user.email.toLowerCase()).toContain("aspiresports.com");
      }
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- POST (Auth check only) ----

  describe("POST - Auth check", () => {
    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        // no cookie
        body: JSON.stringify({
          userId: "00000000-0000-0000-0000-000000000000",
          roleName: "parent",
        }),
      });

      expect(res.status).toBe(401);
    });
  });
});
