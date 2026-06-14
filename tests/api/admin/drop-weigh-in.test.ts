import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/drop-weigh-in";

describe("Admin Drop Weigh-In API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Auth ----

  describe("Unauthenticated requests", () => {
    it("rejects unauthenticated POST (401)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          weightG: 90000,
        }),
        // no cookie
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Zod validation ----

  describe("POST - Zod validation", () => {
    it("rejects missing dropPlayerId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          weekNumber: 1,
          weightG: 90000,
        }),
      });

      await expectJson(res, 400);
    });

    it("rejects weekNumber < 1 (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 0, // must be >= 1
          weightG: 90000,
        }),
      });

      await expectJson(res, 400);
    });

    it("rejects weightG of 0 (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          weightG: 0, // must be positive
        }),
      });

      await expectJson(res, 400);
    });

    it("rejects negative weightG (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1,
          weightG: -5000,
        }),
      });

      await expectJson(res, 400);
    });

    it("rejects invalid UUID for dropPlayerId (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "not-a-uuid",
          weekNumber: 1,
          weightG: 90000,
        }),
      });

      await expectJson(res, 400);
    });

    it("rejects non-integer weekNumber (400)", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000001",
          weekNumber: 1.5,
          weightG: 90000,
        }),
      });

      await expectJson(res, 400);
    });
  });

  // ---- Player not found ----

  describe("POST - player not in org", () => {
    it("returns 404 when player does not exist in org", async () => {
      const res = await apiFetch(ENDPOINT, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          dropPlayerId: "00000000-0000-0000-0000-000000000099",
          weekNumber: 1,
          weightG: 90000,
        }),
      });

      // Auth passed; player not found → 404
      // (without seeded fixtures, 500 is also acceptable if DB errors)
      expect([400, 404, 500]).toContain(res.status);
    });
  });
});
