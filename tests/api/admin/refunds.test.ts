import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/refunds";

describe("Admin Refunds API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- GET (List) ----

  describe("GET - List refund requests", () => {
    it("lists refund requests with summary (200)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.refundRequests)).toBe(true);
      expect(json.summary).toBeDefined();
      expect(json.summary).toHaveProperty("pending");
      expect(json.summary).toHaveProperty("approved");
      expect(json.summary).toHaveProperty("processed");
      expect(json.summary).toHaveProperty("denied");
      expect(json.summary).toHaveProperty("totalPendingAmountCents");
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
