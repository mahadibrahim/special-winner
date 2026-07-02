import { describe, it, expect, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/admin/reports/nps", () => {
  afterAll(() => {
    resetCookies();
  });

  it("requires admin auth", async () => {
    const res = await apiFetch("/api/admin/reports/nps", { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("returns the report shape", async () => {
    const adminCookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/reports/nps", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json).toHaveProperty("nps");
    expect(json).toHaveProperty("responseCount");
    expect(json).toHaveProperty("sentCount");
    expect(json).toHaveProperty("reviewClicks");
    expect(Array.isArray(json.byKind)).toBe(true);
    expect(Array.isArray(json.trend)).toBe(true);
    expect(Array.isArray(json.recent)).toBe(true);
    // Anonymity/scoping: no recipient identity in the payload.
    expect(JSON.stringify(json)).not.toContain("recipientUserId");
  });
});
