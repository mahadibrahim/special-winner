import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/payments";

describe("Admin Payments API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET (List) ----

  describe("GET - List payments", () => {
    it("lists payments with pagination and summary (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.payments)).toBe(true);
      expect(json.pagination).toBeDefined();
      expect(json.pagination).toHaveProperty("limit");
      expect(json.pagination).toHaveProperty("offset");
      expect(json.pagination).toHaveProperty("hasMore");
      expect(json.summary).toBeDefined();
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
