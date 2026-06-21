import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie, expectJson } from "./setup/test-helpers";

describe("GET /api/admin/venue/today", () => {
  it("returns a location-scoped day payload for an admin", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(`/api/admin/venue/today?date=2026-06-19&locationId=`, {
      cookie,
    });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.spaces)).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(Array.isArray(body.attention)).toBe(true);
    expect(body.date).toBe("2026-06-19");
  });

  it("401s without auth", async () => {
    const res = await apiFetch(`/api/admin/venue/today?date=2026-06-19&locationId=`);
    expect(res.status).toBe(401);
  });

  it("400s on missing date", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(`/api/admin/venue/today?locationId=`, { cookie });
    expect(res.status).toBe(400);
  });

  it("400s on bad date format", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(`/api/admin/venue/today?date=not-a-date&locationId=`, { cookie });
    expect(res.status).toBe(400);
  });
});
