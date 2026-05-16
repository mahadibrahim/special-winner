import { describe, it, expect } from "vitest";
import { getSidebarForRole } from "@/lib/admin/sidebar-for-role";

describe("getSidebarForRole", () => {
  it("returns super-admin nav for super_admin role", () => {
    const nav = getSidebarForRole("super_admin");
    const names = nav.flatMap((g) => g.items).map((i) => i.name);
    expect(names).toContain("Seasons");
    expect(names).toContain("Revenue");
    expect(names).not.toContain("Venue Day");
  });

  it("returns venue-manager nav for location_admin role", () => {
    const nav = getSidebarForRole("location_admin");
    const names = nav.flatMap((g) => g.items).map((i) => i.name);
    expect(names).toContain("Venue Day");
    expect(names).not.toContain("Seasons");
  });

  it("returns venue-manager nav as the default for unknown roles", () => {
    expect(
      getSidebarForRole("coach")
        .flatMap((g) => g.items)
        .map((i) => i.name),
    ).toContain("Venue Day");
    expect(
      getSidebarForRole(null)
        .flatMap((g) => g.items)
        .map((i) => i.name),
    ).toContain("Venue Day");
    expect(
      getSidebarForRole(undefined)
        .flatMap((g) => g.items)
        .map((i) => i.name),
    ).toContain("Venue Day");
  });
});
