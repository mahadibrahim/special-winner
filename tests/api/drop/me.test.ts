import { describe, expect, it } from "vitest";
import { apiFetch, expectJson, getParentCookie } from "../setup/test-helpers";

describe("GET /api/drop/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await apiFetch("/api/drop/me", { method: "GET" });
    await expectJson(res, 401);
  });

  // An authenticated user with no drop player row should get { player: null }.
  // We use the parent fixture because the e2e seed does not create a drop
  // player for that account, making this a clean "no registration" check.
  it("returns { player: null } for an authed user with no drop registration", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/drop/me", { method: "GET", cookie });
    const body = await expectJson(res, 200);
    expect(body.player).toBeNull();
  });
});
