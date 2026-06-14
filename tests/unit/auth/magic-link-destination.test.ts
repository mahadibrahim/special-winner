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
  it("login: honors a safe relative redirectTo override", () => {
    expect(
      destinationFor("login", { redirectTo: "/dashboard/payments" }, "https://x", {
        roleNames: ["super_admin"],
      }),
    ).toBe("/dashboard/payments");
  });

  it("login: routes a single-portal admin to their portal home", () => {
    expect(destinationFor("login", null, "https://x", { roleNames: ["super_admin"] })).toBe("/admin");
    expect(destinationFor("login", null, "https://x", { roleNames: ["location_admin"] })).toBe("/admin/venue");
  });

  it("login: routes a multi-portal user to the hub", () => {
    expect(
      destinationFor("login", null, "https://x", { roleNames: ["super_admin", "coach"] }),
    ).toBe("/portal");
  });

  it("login: routes a customer to the dashboard", () => {
    expect(destinationFor("login", null, "https://x", { roleNames: ["parent"] })).toBe("/dashboard");
  });

  it("password_reset_login: same portal routing as login", () => {
    expect(
      destinationFor("password_reset_login", null, "https://x", { roleNames: ["coach"] }),
    ).toBe("/coach");
  });
});

describe("destinationFor — purpose-specific routes (role-agnostic)", () => {
  it("pay_invoice with invoiceId returns the pay page", () => {
    expect(
      destinationFor("pay_invoice", { invoiceId: "abc" }, ORIGIN, { roleNames: ["parent"] }),
    ).toBe("/dashboard/payments/abc/pay");
  });

  it("register_for_season returns the register URL", () => {
    expect(
      destinationFor("register_for_season", { seasonId: "s1" }, ORIGIN, {
        roleNames: ["parent"],
      }),
    ).toBe("/register/s1?returning=1");
  });

  it("unknown purpose falls back to /dashboard", () => {
    expect(
      destinationFor("totally_made_up" as never, null, ORIGIN, { roleNames: ["super_admin"] }),
    ).toBe("/dashboard");
  });
});
