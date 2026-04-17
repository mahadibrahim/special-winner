import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAuthCookie,
  apiFetch,
  resetCookies,
} from "../setup/test-helpers";

describe("Parent Dashboard API Smoke Tests", () => {
  let parentCookie: string;

  beforeAll(async () => {
    parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
  });

  afterAll(() => {
    resetCookies();
  });

  it("GET /api/auth/session — returns authenticated user (200)", async () => {
    const res = await apiFetch("/api/auth/session", {
      cookie: parentCookie,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authenticated).toBe(true);
    expect(json.user).toBeDefined();
    expect(json.user.email).toBe("parent@test.aspiresports.com");
  });

  it("GET /api/family-members — returns array (200)", async () => {
    const res = await apiFetch("/api/family-members", {
      cookie: parentCookie,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.familyMembers).toBeDefined();
    expect(Array.isArray(json.familyMembers)).toBe(true);
  });

  it("GET /api/registrations — returns array (200)", async () => {
    const res = await apiFetch("/api/registrations", {
      cookie: parentCookie,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.registrations).toBeDefined();
    expect(Array.isArray(json.registrations)).toBe(true);
  });

  it("GET /api/payments/history — returns 200 (may be empty)", async () => {
    const res = await apiFetch("/api/payments/history", {
      cookie: parentCookie,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.payments).toBeDefined();
    expect(Array.isArray(json.payments)).toBe(true);
  });

  it("GET /api/user/profile — returns user profile data (200)", async () => {
    const res = await apiFetch("/api/user/profile", {
      cookie: parentCookie,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile).toBeDefined();
    expect(json.profile.email).toBe("parent@test.aspiresports.com");
  });

  it("GET /api/user/announcements — returns 200", async () => {
    const res = await apiFetch("/api/user/announcements", {
      cookie: parentCookie,
    });

    // Announcements should return 200; if the endpoint has issues, note it
    if (res.status !== 200) {
      console.warn(
        `[dashboard] /api/user/announcements returned ${res.status} — ` +
          "endpoint may need attention but dashboard should degrade gracefully"
      );
    }
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.announcements).toBeDefined();
    expect(Array.isArray(json.announcements)).toBe(true);
  });
});
