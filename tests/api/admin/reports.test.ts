import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Admin Reports API (Smoke Tests)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => {
    resetCookies();
  });

  // ---- Revenue Report ----

  describe("GET /api/admin/reports/revenue", () => {
    it("returns 200 with revenue data", async () => {
      const res = await apiFetch("/api/admin/reports/revenue", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.summary).toBeDefined();
      expect(json.revenueByPeriod).toBeDefined();
      expect(json.dateRange).toBeDefined();
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/reports/revenue", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Registrations Report ----

  describe("GET /api/admin/reports/registrations", () => {
    it("returns 200 with registration report data", async () => {
      const res = await apiFetch("/api/admin/reports/registrations", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.summary).toBeDefined();
      expect(json.registrationsByPeriod).toBeDefined();
      expect(json.dateRange).toBeDefined();
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/reports/registrations", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  // ---- Attendance Report ----

  describe("GET /api/admin/reports/attendance", () => {
    it("returns 200 with attendance data", async () => {
      const res = await apiFetch("/api/admin/reports/attendance", {
        method: "GET",
        cookie: adminCookie,
      });

      const json = await expectJson(res, 200);
      expect(json.summary).toBeDefined();
      expect(json.attendanceByPeriod).toBeDefined();
      expect(json.dateRange).toBeDefined();
    });

    it("rejects unauthenticated request (401)", async () => {
      const res = await apiFetch("/api/admin/reports/attendance", {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });
});
