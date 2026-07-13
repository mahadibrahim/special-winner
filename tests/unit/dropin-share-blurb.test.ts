import { describe, it, expect } from "vitest";
import { buildShareBlurb } from "@/lib/dropin/share-blurb";

describe("buildShareBlurb", () => {
  it("formats sport, venue, local time, spots, and url", () => {
    const blurb = buildShareBlurb({
      sport: "soccer",
      venueName: "Worthington",
      startsAt: new Date("2026-07-14T23:00:00Z"), // 7 PM America/New_York
      spotsLeft: 4,
      url: "https://aspiresportsohio.com/dropin/abc?src=host-share",
      timeZone: "America/New_York",
    });
    expect(blurb).toContain("soccer");
    expect(blurb).toContain("Worthington");
    expect(blurb).toContain("7:00");
    expect(blurb).toContain("4 spots left");
    expect(blurb).toContain("https://aspiresportsohio.com/dropin/abc?src=host-share");
  });

  it("says 'Almost full' at 1 spot and skips venue when null", () => {
    const blurb = buildShareBlurb({
      sport: "futsal",
      venueName: null,
      startsAt: new Date("2026-07-14T23:00:00Z"),
      spotsLeft: 1,
      url: "https://x.test/g",
      timeZone: "America/New_York",
    });
    expect(blurb).toContain("1 spot left");
    expect(blurb).not.toContain("null");
  });
});
