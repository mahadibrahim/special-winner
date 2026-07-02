import { describe, it, expect, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/admin/reports/referee-ratings", () => {
  afterAll(() => {
    resetCookies();
  });

  it("requires admin auth", async () => {
    const res = await apiFetch("/api/admin/reports/referee-ratings", { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("returns the report shape without rater identity", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/reports/referee-ratings", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.referees)).toBe(true);
    expect(Array.isArray(json.recentComments)).toBe(true);
    const payload = JSON.stringify(json);
    expect(payload).not.toContain("recipientUserId");
    expect(payload).not.toContain("raterUserId");
  });
});
