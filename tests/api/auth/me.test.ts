/**
 * GET /api/auth/me — response contract.
 *
 * Locked down as part of perf/site-multipliers: me.ts was changed to read
 * context.locals.user/.session (populated by middleware on every request)
 * instead of calling validateSession() a second time. This test pins the
 * exact response shape both before-fix and after-fix code must produce, so
 * a future edit to either me.ts or the middleware auth block can't silently
 * change what Navigation (src/components/navigation.tsx) receives.
 *
 * See .superpowers/sdd/perf-sweep-customer.md item 2.
 */
import { describe, it, expect } from "vitest";
import { apiFetch, expectJson, getParentCookie } from "../setup/test-helpers";

describe("GET /api/auth/me", () => {
  it("authenticated: returns { user: {...}, authenticated: true } with exactly the Navigation-consumed fields", async () => {
    const cookie = await getParentCookie();

    const res = await apiFetch("/api/auth/me", { method: "GET", cookie });
    const json = await expectJson(res, 200);

    expect(json.authenticated).toBe(true);
    expect(json.user).toBeTruthy();
    expect(json.user.email).toBe("parent@test.aspiresports.com");
    expect(typeof json.user.id).toBe("string");
    expect(json.user).toHaveProperty("firstName");
    expect(json.user).toHaveProperty("lastName");
    expect(json.user).toHaveProperty("emailVerified");
    expect(json.user).toHaveProperty("avatarUrl");

    // Exact key set — guards against accidentally leaking locals.user
    // fields (birthDate, phone, gender) that Navigation never asked for.
    expect(Object.keys(json.user).sort()).toEqual(
      [
        "avatarUrl",
        "email",
        "emailVerified",
        "firstName",
        "id",
        "lastName",
      ].sort(),
    );
  });

  it("unauthenticated: returns { user: null, authenticated: false }", async () => {
    const res = await apiFetch("/api/auth/me", { method: "GET" });
    const json = await expectJson(res, 200);

    expect(json).toEqual({ user: null, authenticated: false });
  });
});
