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
 * Beyond the JSON shape, this suite pins the two cookie-side-effect
 * invariants the locals-based me.ts depends on the middleware for:
 *   - session renewal: Lucia marks a session `fresh` when less than half
 *     its 30-day lifetime remains; middleware then re-sets the session
 *     cookie. me.ts no longer calls validateSession() itself, so the
 *     middleware MUST be the one delivering that Set-Cookie on this route.
 *   - invalid session: middleware clears the dead cookie (blank
 *     Set-Cookie, Max-Age=0) and me.ts returns the null-user shape.
 *
 * See .superpowers/sdd/perf-sweep-customer.md item 2.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { sessions } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import {
  apiFetch,
  expectJson,
  getAuthCookie,
  getParentCookie,
} from "../setup/test-helpers";

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

  it("session in Lucia's renewal window: middleware's refreshed cookie reaches the client", async () => {
    // Fresh sign-in — deliberately NOT the cached getParentCookie(), because
    // this test mutates the session row's expiry and must not poison the
    // cookie other suites share.
    const setCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );
    const sessionId = setCookie.match(/auth_session=([^;]+)/)?.[1];
    expect(sessionId).toBeTruthy();

    // Age the session into Lucia's renewal window. lucia.ts does not
    // override sessionExpiresIn, so the default 30 days applies, and
    // lucia.validateSession() marks a session `fresh` (extending expiresAt
    // and prompting the middleware to re-set the cookie) once LESS than
    // half the lifetime — 15 days — remains. now+10d is inside that window
    // while still comfortably valid.
    const agedExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await getDb()
      .update(sessions)
      .set({ expiresAt: agedExpiry })
      .where(eq(sessions.id, sessionId!));

    const res = await apiFetch("/api/auth/me", {
      method: "GET",
      cookie: `auth_session=${sessionId}`,
    });
    const json = await expectJson(res, 200);
    expect(json.authenticated).toBe(true);

    // The renewal Set-Cookie must be on THIS response — me.ts no longer
    // validates the session itself, so only the middleware can deliver it.
    // Lucia renews in place (same session id, new expiry).
    const renewCookie = res.headers.get("set-cookie") ?? "";
    expect(renewCookie).toContain(`auth_session=${sessionId}`);
    expect(renewCookie).toMatch(/Max-Age=\d/);

    // And the renewal actually persisted: expiresAt moved forward past the
    // aged value (Lucia resets it to now + 30d).
    const [row] = await getDb()
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId!));
    expect(row).toBeDefined();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(agedExpiry.getTime());

    // Cleanup — this session is single-purpose.
    await getDb().delete(sessions).where(eq(sessions.id, sessionId!));
  });

  it("invalid session id: null-user response + blank Set-Cookie clearing the dead cookie", async () => {
    const res = await apiFetch("/api/auth/me", {
      method: "GET",
      cookie: "auth_session=definitely-not-a-real-session-id",
    });
    const json = await expectJson(res, 200);
    expect(json).toEqual({ user: null, authenticated: false });

    // Middleware detects the dead session and sets a blank cookie
    // (lucia.createBlankSessionCookie: empty value, Max-Age=0) so the
    // client stops replaying it.
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/auth_session=;/);
    expect(setCookie).toContain("Max-Age=0");
  });
});
