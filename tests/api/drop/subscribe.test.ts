import { describe, expect, it } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("POST /api/drop/subscribe", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await apiFetch("/api/drop/subscribe", {
      method: "POST",
      body: JSON.stringify({ dropPlayerId: "00000000-0000-0000-0000-000000000001" }),
    });
    await expectJson(res, 401);
  });
});

describe("POST /api/drop/cancel", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await apiFetch("/api/drop/cancel", {
      method: "POST",
      body: JSON.stringify({ dropSubscriptionId: "00000000-0000-0000-0000-000000000001" }),
    });
    await expectJson(res, 401);
  });

  // A valid UUID that doesn't exist in the DB should return 404 (not a 500
  // crash) — validates the endpoint's error handling path without Stripe.
  // Requires an authenticated user session, so we use the parent fixture.
  // Skip: this case needs a running dev server with seeded data in CI.
  it.skip("returns 404 for a subscription that does not belong to the user", async () => {
    const { getAuthCookie } = await import("../setup/test-helpers");
    const cookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );
    const res = await fetch(`${BASE}/api/drop/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        dropSubscriptionId: "00000000-0000-0000-0000-000000000099",
      }),
    });
    expect(res.status).toBe(404);
  });
});
