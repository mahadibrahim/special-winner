import { describe, it, expect } from "vitest";
import {
  destinationFor,
  isSafeRelativePath,
} from "@/lib/auth/magic-link-destination";

const ORIGIN = "http://localhost:4321";

describe("isSafeRelativePath", () => {
  it("accepts site-relative paths", () => {
    expect(isSafeRelativePath("/register/abc")).toBe(true);
    expect(isSafeRelativePath("/dashboard/payments?x=1")).toBe(true);
    expect(isSafeRelativePath("/")).toBe(true);
  });

  it("rejects scheme-relative and absolute URLs", () => {
    expect(isSafeRelativePath("//evil.example.com")).toBe(false);
    expect(isSafeRelativePath("https://evil.example.com")).toBe(false);
    expect(isSafeRelativePath("http://localhost/x")).toBe(false);
  });

  it("rejects non-path and non-string values", () => {
    expect(isSafeRelativePath("register/abc")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(42)).toBe(false);
  });
});

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
