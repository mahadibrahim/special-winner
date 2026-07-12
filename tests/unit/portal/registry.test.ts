import { describe, it, expect } from "vitest";
import { PORTALS, type Portal } from "@/lib/portal/registry";

describe("PORTALS registry", () => {
  it("defines the five portals", () => {
    const ids = PORTALS.map((p) => p.id).sort();
    expect(ids).toEqual(["admin", "coach", "media", "referee", "venue"]);
  });

  it("admin and venue share the /admin base path but differ in home", () => {
    const admin = PORTALS.find((p) => p.id === "admin")!;
    const venue = PORTALS.find((p) => p.id === "venue")!;
    expect(admin.basePath).toBe("/admin");
    expect(venue.basePath).toBe("/admin");
    expect(admin.homeHref).toBe("/admin");
    expect(venue.homeHref).toBe("/admin/venue");
  });

  it("admin portal carries the super-admin nav (Seasons present, Check-in absent)", () => {
    const admin = PORTALS.find((p) => p.id === "admin")!;
    const names = admin.nav.flatMap((g) => g.items).map((i) => i.name);
    expect(names).toContain("Seasons");
    expect(names).not.toContain("Check-in");
  });

  it("venue portal carries the venue-manager nav (Command center present, Check-in and Seasons absent)", () => {
    const venue = PORTALS.find((p) => p.id === "venue")!;
    const names = venue.nav.flatMap((g) => g.items).map((i) => i.name);
    // Command center replaced the old Check-in page as the single
    // front-desk path (38cb532d); this test lagged behind that change.
    expect(names).toContain("Command center");
    expect(names).not.toContain("Check-in");
    expect(names).not.toContain("Seasons");
  });

  it("every portal grants at least one role and has an icon", () => {
    for (const p of PORTALS) {
      expect(p.roles.length).toBeGreaterThan(0);
      expect(p.icon).toBeTruthy();
    }
  });

  it("referee portal is now available (SP5)", () => {
    const referee = PORTALS.find((p) => p.id === "referee")!;
    expect(referee.available).toBe(true);
  });

  it("admin, venue, coach, media are available", () => {
    for (const id of ["admin", "venue", "coach", "media"] as const) {
      expect(PORTALS.find((p) => p.id === id)!.available).toBe(true);
    }
  });
});
