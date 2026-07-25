import { describe, it, expect } from "vitest";
import { getVenueFacts } from "@/lib/locations/venue-facts";

describe("getVenueFacts", () => {
  it("returns null for unknown slugs", () => {
    expect(getVenueFacts("loc-g00dqku7")).toBeNull();
  });

  it("worthington: 2 turf fields, futsal coming, no concession text", () => {
    const f = getVenueFacts("worthington")!;
    expect(f.specs.find((s) => s.label.toLowerCase().includes("turf"))?.n).toBe(
      "2",
    );
    expect(f.comingSoon.join(" ")).toMatch(/futsal/i);
    const all = JSON.stringify(f).toLowerCase();
    expect(all).not.toContain("concession");
    expect(all).not.toContain("{{");
    expect(all).not.toContain("3 indoor");
  });

  it("downtown: pickup-first offerings, no youth", () => {
    const f = getVenueFacts("downtown")!;
    expect(f.offerings.pickup).toBe(true);
    expect(f.offerings.youth).toBe(false);
  });

  it("program-page role: no venue-operations content (hours, parking, rentals)", () => {
    for (const slug of ["worthington", "downtown"]) {
      const all = JSON.stringify(getVenueFacts(slug)).toLowerCase();
      expect(all).not.toContain("parking");
      expect(all).not.toContain("rental");
      expect(all).not.toMatch(/\bhours\b/);
      expect(all).not.toContain("11 pm");
      expect(all).not.toContain("most nights");
    }
  });
});
