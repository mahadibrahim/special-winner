import { describe, it, expect, vi } from "vitest";

// Mock all Astro virtual modules and heavy dependencies so we can import
// src/middleware.ts in a plain Node/Vitest environment.
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

describe("middleware ROUTE_RULES — referee", () => {
  const refereeRule = ROUTE_RULES.find(
    (rule) => rule.kind === "role" && rule.pattern.test("/referee"),
  );

  it("has a rule that matches /referee", () => {
    expect(refereeRule).toBeDefined();
  });

  it("also matches /referee/pay", () => {
    expect(refereeRule!.pattern.test("/referee/pay")).toBe(true);
  });

  it("is kind: role", () => {
    expect(refereeRule!.kind).toBe("role");
  });

  it("includes referee in roles", () => {
    const rule = refereeRule as Extract<typeof refereeRule, { kind: "role" }>;
    expect(rule!.roles).toContain("referee");
  });

  it("includes super_admin in roles", () => {
    const rule = refereeRule as Extract<typeof refereeRule, { kind: "role" }>;
    expect(rule!.roles).toContain("super_admin");
  });
});
