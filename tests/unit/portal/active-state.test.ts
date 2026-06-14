import { describe, it, expect } from "vitest";
import { isNavItemActive } from "@/lib/portal/active-state";

describe("isNavItemActive", () => {
  it("matches an exact path", () => {
    expect(isNavItemActive("/admin/seasons", "/admin/seasons")).toBe(true);
  });

  it("matches a nested path under the item href", () => {
    expect(isNavItemActive("/admin/seasons/123", "/admin/seasons")).toBe(true);
  });

  it("does not treat /admin home as active for every /admin/* route", () => {
    expect(isNavItemActive("/admin/seasons", "/admin")).toBe(false);
  });

  it("matches /admin home only on exact /admin", () => {
    expect(isNavItemActive("/admin", "/admin")).toBe(true);
  });

  it("does not match a sibling prefix", () => {
    expect(isNavItemActive("/admin/seasonal", "/admin/seasons")).toBe(false);
  });
});
