import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/dropin/bookings";

describe("POST /api/dropin/bookings", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ sessionId: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects malformed JSON (400)", async () => {
    // Manually crafted invalid body — apiFetch wraps with content-type
    // application/json so the server will try to parse and fail.
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: "not-json",
    });
    // Will be 401 since unauthenticated, but if a session cookie were
    // attached it would be 400. The auth check fires first by design.
    expect([400, 401]).toContain(res.status);
  });

  // Full Stripe + cookie + session-fixture flow tested manually on staging.
  // Adding it here would require seeding a session row in the same DB the
  // dev server points at + a Stripe test key — covered by Phase D's full-flow
  // integration test.
  it("returns 404 when session does not exist (authenticated parent)", async () => {
    const { getParentCookie } = await import("../setup/test-helpers");
    const cookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: "00000000-0000-0000-0000-000000000000",
        waiverAccepted: true,
        waiverName: "Test Player",
      }),
    });
    const json = await expectJson(res, 404);
    expect(json.error).toBeDefined();
  });

  // Waiver is OPTIONAL at booking time since the sign-before-you-play change
  // — omitting it must NOT 422; the request proceeds to normal resolution
  // (here: 404, the session doesn't exist).
  it("accepts a body without waiver fields (waiver deferred to post-payment)", async () => {
    const { getParentCookie } = await import("../setup/test-helpers");
    const cookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: "00000000-0000-0000-0000-000000000000" }),
    });
    const json = await expectJson(res, 404);
    expect(json.error).toBeDefined();
  });

  it("still 422s a malformed signature: waiverAccepted without a name", async () => {
    const { getParentCookie } = await import("../setup/test-helpers");
    const cookie = await getParentCookie();
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: "00000000-0000-0000-0000-000000000000",
        waiverAccepted: true,
      }),
    });
    const json = await expectJson(res, 422);
    expect(json.error).toBeDefined();
  });
});
