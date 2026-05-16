import { describe, it, expect } from "vitest";
import { destinationFor } from "@/lib/auth/magic-link-destination";

const ORIGIN = "http://localhost:4321";

describe("destinationFor — login purpose", () => {
  it("sends admin users to /admin on plain login", () => {
    expect(destinationFor("login", null, ORIGIN, { isAdminRole: true })).toBe("/admin");
  });

  it("sends non-admin users to /dashboard on plain login", () => {
    expect(destinationFor("login", null, ORIGIN, { isAdminRole: false })).toBe("/dashboard");
  });

  it("honors a safe relative redirectTo override (non-admin)", () => {
    expect(
      destinationFor("login", { redirectTo: "/dashboard/payments" }, ORIGIN, {
        isAdminRole: false,
      }),
    ).toBe("/dashboard/payments");
  });

  it("honors a safe relative redirectTo override (admin)", () => {
    expect(
      destinationFor("login", { redirectTo: "/admin/seasons" }, ORIGIN, {
        isAdminRole: true,
      }),
    ).toBe("/admin/seasons");
  });

  it("rejects scheme-relative redirectTo (open-redirect protection)", () => {
    expect(
      destinationFor("login", { redirectTo: "//evil.example.com" }, ORIGIN, {
        isAdminRole: false,
      }),
    ).toBe("/dashboard");
  });

  it("rejects absolute-URL redirectTo (open-redirect protection)", () => {
    expect(
      destinationFor("login", { redirectTo: "https://evil.example.com" }, ORIGIN, {
        isAdminRole: false,
      }),
    ).toBe("/dashboard");
  });

  it("password_reset_login follows the same rules as login", () => {
    expect(
      destinationFor("password_reset_login", null, ORIGIN, { isAdminRole: true }),
    ).toBe("/admin");
  });
});

describe("destinationFor — purpose-specific routes (role-agnostic)", () => {
  it("pay_invoice with invoiceId returns the pay page", () => {
    expect(
      destinationFor("pay_invoice", { invoiceId: "abc" }, ORIGIN, { isAdminRole: false }),
    ).toBe("/dashboard/payments/abc/pay");
  });

  it("register_for_season returns the register URL", () => {
    expect(
      destinationFor("register_for_season", { seasonId: "s1" }, ORIGIN, {
        isAdminRole: false,
      }),
    ).toBe("/register/s1?returning=1");
  });

  it("unknown purpose falls back to /dashboard", () => {
    expect(
      destinationFor("totally_made_up" as never, null, ORIGIN, { isAdminRole: true }),
    ).toBe("/dashboard");
  });
});
