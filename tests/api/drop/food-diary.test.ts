import { describe, expect, it } from "vitest";
import {
  apiFetch,
  expectJson,
  getParentCookie,
} from "../setup/test-helpers";

describe("POST /api/drop/food-diary", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await apiFetch("/api/drop/food-diary", {
      method: "POST",
      body: JSON.stringify({ weekNumber: 1 }),
    });
    await expectJson(res, 401);
  });

  it("returns 400 when weekNumber is missing", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/drop/food-diary", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    const body = await expectJson(res, 400);
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when weekNumber is 0 (below minimum of 1)", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/drop/food-diary", {
      method: "POST",
      cookie,
      body: JSON.stringify({ weekNumber: 0 }),
    });
    const body = await expectJson(res, 400);
    expect(body.error).toBeTruthy();
  });
});
