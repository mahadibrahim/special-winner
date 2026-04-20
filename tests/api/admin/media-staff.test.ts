import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Admin Media Staff API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => resetCookies());

  it("GET /api/admin/media/staff returns media_staff users with profile data", async () => {
    const res = await apiFetch("/api/admin/media/staff", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.staff)).toBe(true);
    const seeded = json.staff.find(
      (s: any) => s.email === "media_staff@test.aspiresports.com"
    );
    expect(seeded).toBeDefined();
    expect(seeded.active).toBe(true);
  });

  it("POST /api/admin/media/staff/invite creates a pending invite", async () => {
    const email = `invite-${Date.now()}@test.aspiresports.com`;
    const res = await apiFetch("/api/admin/media/staff/invite", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ email, firstName: "Inv", lastName: "Itee" }),
    });
    const json = await expectJson(res, 201);
    expect(json.invite.email).toBe(email);
  });

  it("POST invite rejects non-admin (401/403)", async () => {
    const res = await apiFetch("/api/admin/media/staff/invite", {
      method: "POST",
      body: JSON.stringify({ email: "x@x.com" }),
    });
    expect(res.status).toBe(401);
  });
});
