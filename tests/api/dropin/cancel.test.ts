import { describe, it, expect } from "vitest";
import { apiFetch } from "../setup/test-helpers";

describe("POST /api/dropin/bookings/:id/cancel", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(
      "/api/dropin/bookings/00000000-0000-0000-0000-000000000000/cancel",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/dropin/bookings/:id/refund", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(
      "/api/admin/dropin/bookings/00000000-0000-0000-0000-000000000000/refund",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users (403)", async () => {
    const { getParentCookie } = await import("../setup/test-helpers");
    const cookie = await getParentCookie();
    const res = await apiFetch(
      "/api/admin/dropin/bookings/00000000-0000-0000-0000-000000000000/refund",
      { method: "POST", cookie },
    );
    expect(res.status).toBe(403);
  });
});
