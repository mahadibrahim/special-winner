import { describe, it, expect, vi } from "vitest";

// Mock all Astro virtual modules and heavy dependencies so we can import
// src/middleware.ts in a plain Node/Vitest environment. Mirrors
// tests/unit/middleware/referee-route-rule.test.ts.
vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/organization/domain-resolver", () => ({ resolveOrganizationFromHost: vi.fn() }));
vi.mock("@/lib/branding/resolver", () => ({ resolveBrandProfile: vi.fn() }));
vi.mock("@/lib/auth/lucia", () => ({ lucia: { sessionCookieName: "auth_session", validateSession: vi.fn() } }));
vi.mock("@/lib/auth/roles", () => ({ getUserRoles: vi.fn(), getCoachTeamIds: vi.fn() }));
vi.mock("@/lib/admin/active-venue", () => ({ ACTIVE_VENUE_COOKIE: "active_venue", validateActiveVenue: vi.fn() }));
vi.mock("@/lib/env", () => ({ ensureEnvValidated: vi.fn() }));
vi.mock("@/lib/organization/soccerone-routing", () => ({
  isSoccerOneHost: vi.fn(() => false),
  rewriteSoccerOnePath: vi.fn(() => null),
  getAspireToSoccerOneRedirect: vi.fn(() => null),
  brandFromHost: vi.fn(() => "aspire"),
}));

import { ROUTE_RULES } from "@/middleware";

describe("middleware ROUTE_RULES — staff", () => {
  const staffRule = ROUTE_RULES.find(
    (rule) => rule.kind === "role" && rule.pattern.test("/staff"),
  );

  it("has a rule that matches /staff", () => {
    expect(staffRule).toBeDefined();
  });

  it("also matches /staff/incidents/new", () => {
    expect(staffRule!.pattern.test("/staff/incidents/new")).toBe(true);
  });

  it("does not match unrelated paths like /staffing", () => {
    expect(staffRule!.pattern.test("/staffing")).toBe(false);
  });

  it("is kind: role", () => {
    expect(staffRule!.kind).toBe("role");
  });

  it("admits location_admin, coach, and super_admin", () => {
    const rule = staffRule as Extract<typeof staffRule, { kind: "role" }>;
    expect(rule!.roles).toContain("location_admin");
    expect(rule!.roles).toContain("coach");
    expect(rule!.roles).toContain("super_admin");
  });
});
