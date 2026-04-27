/**
 * Middleware auth-redirect smoke tests.
 *
 * Validates the route-prefix rules added in middleware.ts:
 *   - Unauthenticated requests to protected routes → 302 /signin?redirect=…
 *   - Role-restricted routes redirect wrong roles to /dashboard
 *   - Authenticated users visiting /signin or /signup → 302 /dashboard
 *   - Public routes are unaffected
 *   - /api/** routes are NOT caught by middleware redirect logic
 *
 * Run against a live dev server:
 *   TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/middleware-auth.test.ts
 */

import { describe, it, expect } from "vitest";
import { getAdminCookie, getParentCookie } from "./setup/test-helpers";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

/**
 * Fetch a page URL without following redirects so we can inspect the 302.
 */
async function fetchPage(
  path: string,
  cookie?: string
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers["Cookie"] = cookie;
  }
  return fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers,
  });
}

describe("Middleware auth-redirect rules", () => {
  // ------------------------------------------------------------------ //
  // Unauthenticated → /signin?redirect=…
  // ------------------------------------------------------------------ //

  describe("unauthenticated access to protected routes", () => {
    it("GET /dashboard → 302 to /signin?redirect=/dashboard", async () => {
      const res = await fetchPage("/dashboard");
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/signin");
      expect(location).toContain("redirect=");
      expect(location).toContain(encodeURIComponent("/dashboard"));
    });

    it("GET /admin → 302 to /signin?redirect=/admin", async () => {
      const res = await fetchPage("/admin");
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/signin");
      expect(location).toContain("redirect=");
    });

    it("GET /coach → 302 to /signin?redirect=…", async () => {
      const res = await fetchPage("/coach");
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/signin");
    });

    it("GET /messages → 302 to /signin?redirect=…", async () => {
      const res = await fetchPage("/messages");
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/signin");
    });

    it("GET /media/jobs → 302 to /signin?redirect=…", async () => {
      const res = await fetchPage("/media/jobs");
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/signin");
    });
  });

  // ------------------------------------------------------------------ //
  // Wrong role → /dashboard?error=unauthorized
  // ------------------------------------------------------------------ //

  describe("role enforcement", () => {
    it("authenticated parent GET /admin → 302 to /dashboard (no admin role)", async () => {
      const cookie = await getParentCookie();
      const res = await fetchPage("/admin", cookie);
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/dashboard");
      expect(location).toContain("error=unauthorized");
    });

    it("authenticated admin GET /admin → 200 (has admin role)", async () => {
      const cookie = await getAdminCookie();
      const res = await fetchPage("/admin", cookie);
      // Admin gets through; could be 200 or a redirect within admin UI
      // but must NOT be redirected to /signin or /dashboard?error=unauthorized
      expect(res.status).not.toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).not.toContain("/signin");
      expect(location).not.toContain("error=unauthorized");
    });
  });

  // ------------------------------------------------------------------ //
  // Authenticated users bounced away from /signin and /signup
  // ------------------------------------------------------------------ //

  describe("REDIRECT_IF_AUTHED", () => {
    it("authenticated GET /signin → 302 to /dashboard", async () => {
      const cookie = await getAdminCookie();
      const res = await fetchPage("/signin", cookie);
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/dashboard");
    });

    it("authenticated GET /signup → 302 to /dashboard", async () => {
      const cookie = await getAdminCookie();
      const res = await fetchPage("/signup", cookie);
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/dashboard");
    });
  });

  // ------------------------------------------------------------------ //
  // Public routes are not affected
  // ------------------------------------------------------------------ //

  describe("public routes (no rule)", () => {
    it("unauthenticated GET / → not a redirect to /signin", async () => {
      const res = await fetchPage("/");
      // The home page should be reachable (200 or redirect to org-specific home)
      // but MUST NOT redirect to /signin
      const location = res.headers.get("location") ?? "";
      expect(location).not.toContain("/signin");
    });
  });

  // ------------------------------------------------------------------ //
  // API routes are excluded from the redirect rules
  // ------------------------------------------------------------------ //

  describe("/api/** routes bypass middleware redirect logic", () => {
    it("unauthenticated GET /api/auth/session → 200 JSON (not a 302)", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/session`, {
        redirect: "manual",
      });
      // Returns JSON 200 with { authenticated: false }
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });
});
