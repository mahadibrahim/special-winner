import { describe, it, expect } from "vitest";
import {
  resolvePortalsForUser,
  resolvePostLoginTarget,
  getPortalById,
} from "@/lib/portal/resolve";

describe("resolvePortalsForUser", () => {
  it("returns the admin portal for a super_admin", () => {
    expect(resolvePortalsForUser(["super_admin"]).map((p) => p.id)).toEqual(["admin"]);
  });

  it("returns the venue portal for a location_admin", () => {
    expect(resolvePortalsForUser(["location_admin"]).map((p) => p.id)).toEqual(["venue"]);
  });

  it("returns both portals for a multi-role user, registry order preserved", () => {
    const ids = resolvePortalsForUser(["coach", "super_admin"]).map((p) => p.id);
    expect(ids).toEqual(["admin", "coach"]);
  });

  it("maps either media role to the media portal, once", () => {
    expect(resolvePortalsForUser(["media_staff", "media_editor"]).map((p) => p.id)).toEqual(["media"]);
  });

  it("resolves the referee portal for a referee role (SP5: now available)", () => {
    expect(resolvePortalsForUser(["referee"]).map((p) => p.id)).toEqual(["referee"]);
  });

  it("returns nothing for customer-only roles", () => {
    expect(resolvePortalsForUser(["parent", "player"])).toEqual([]);
  });
});

describe("resolvePostLoginTarget", () => {
  it("sends customers to the dashboard", () => {
    expect(resolvePostLoginTarget(["parent"])).toBe("/dashboard");
  });

  it("sends a single-portal user straight to that portal's home", () => {
    expect(resolvePostLoginTarget(["super_admin"])).toBe("/admin");
    expect(resolvePostLoginTarget(["location_admin"])).toBe("/admin/venue");
    expect(resolvePostLoginTarget(["coach"])).toBe("/coach");
  });

  it("sends a multi-portal user to the hub", () => {
    expect(resolvePostLoginTarget(["super_admin", "coach"])).toBe("/portal");
  });
});

describe("getPortalById", () => {
  it("finds a portal", () => {
    expect(getPortalById("admin")?.homeHref).toBe("/admin");
  });
  it("returns undefined for an unknown id", () => {
    // @ts-expect-error testing the runtime guard with a bad id
    expect(getPortalById("nope")).toBeUndefined();
  });
});
