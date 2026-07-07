import { describe, it, expect, afterAll } from "vitest";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("GET /api/account-credit/balance", () => {
  afterAll(() => resetCookies());

  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch("/api/account-credit/balance");
    expect(res.status).toBe(401);
  });

  it("returns a numeric balanceCents for an authed user", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/account-credit/balance", { cookie });
    const json = await expectJson(res, 200);
    expect(typeof json.balanceCents).toBe("number");
    expect(json.balanceCents).toBeGreaterThanOrEqual(0);
  });
});
