import { describe, it, expect } from "vitest";
import { apiFetch, expectJson, getAuthCookie } from "../setup/test-helpers";

const TEST_EMAIL = `test-signup-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPassword123!";
const TEST_FIRST = "Test";
const TEST_LAST = "Signup";

describe("Auth API", () => {
  // ---- Signup ----

  describe("POST /api/auth/signup", () => {
    it("creates a new account", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          firstName: TEST_FIRST,
          lastName: TEST_LAST,
        }),
      });

      expect(res.status).toBeLessThan(400);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.email).toBe(TEST_EMAIL.toLowerCase());
    });

    it("rejects duplicate email", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          firstName: TEST_FIRST,
          lastName: TEST_LAST,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing password", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: `no-pass-${Date.now()}@example.com`,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ---- Signin ----

  describe("POST /api/auth/signin", () => {
    it("signs in with valid credentials", async () => {
      const cookie = await getAuthCookie(TEST_EMAIL, TEST_PASSWORD);
      expect(cookie).toBeTruthy();
      expect(cookie).toContain("auth_session");
    });

    it("rejects wrong password", async () => {
      const res = await apiFetch("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: "WrongPassword999!",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects nonexistent email", async () => {
      const res = await apiFetch("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({
          email: `nonexistent-${Date.now()}@example.com`,
          password: TEST_PASSWORD,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ---- Session ----

  describe("GET /api/auth/session", () => {
    it("returns authenticated user when cookie provided", async () => {
      const cookie = await getAuthCookie(TEST_EMAIL, TEST_PASSWORD);

      const res = await apiFetch("/api/auth/session", {
        method: "GET",
        cookie,
      });

      const json = await expectJson(res, 200);
      expect(json.authenticated).toBe(true);
      expect(json.user.email).toBe(TEST_EMAIL.toLowerCase());
    });

    it("returns unauthenticated without cookie", async () => {
      const res = await apiFetch("/api/auth/session", {
        method: "GET",
      });

      const json = await expectJson(res, 200);
      expect(json.authenticated).toBe(false);
    });
  });

  // ---- Signout ----

  describe("POST /api/auth/signout", () => {
    it("invalidates session", async () => {
      const cookie = await getAuthCookie(TEST_EMAIL, TEST_PASSWORD);

      const res = await apiFetch("/api/auth/signout", {
        method: "POST",
        cookie,
        headers: { Accept: "application/json" },
      });

      expect(res.status).toBeLessThan(400);
    });
  });
});
