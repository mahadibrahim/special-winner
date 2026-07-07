import { describe, it, expect } from "vitest";
import { deriveLaborRole } from "@/lib/time-tracking/derive-labor-role";

describe("deriveLaborRole", () => {
  it("returns venue_manager when the user holds location_admin", () => {
    expect(deriveLaborRole(["location_admin"])).toBe("venue_manager");
  });

  it("returns coach when the user holds coach but not location_admin", () => {
    expect(deriveLaborRole(["coach"])).toBe("coach");
  });

  it("prefers venue_manager when the user holds both location_admin and coach", () => {
    expect(deriveLaborRole(["coach", "location_admin"])).toBe("venue_manager");
  });

  it("returns null when the user holds neither role", () => {
    expect(deriveLaborRole(["parent"])).toBeNull();
  });

  it("returns null for an empty role list", () => {
    expect(deriveLaborRole([])).toBeNull();
  });

  it("returns null for a referee-only user (referees clock in via the match endpoint, not the generic staff shift flow)", () => {
    expect(deriveLaborRole(["referee"])).toBeNull();
  });

  it("returns null for a super_admin with no location_admin/coach assignment", () => {
    expect(deriveLaborRole(["super_admin"])).toBeNull();
  });
});
