import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/dashboard/play/standings", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getParentCookie();
  });

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/dashboard/play/standings");
    expect(res.status).toBe(401);
  });

  it("returns a standings array for an authenticated user", async () => {
    const res = await apiFetch("/api/dashboard/play/standings", { cookie });
    const body = await expectJson(res, 200);
    expect(Array.isArray(body.standings)).toBe(true);
  });

  afterAll(() => resetCookies());
});
