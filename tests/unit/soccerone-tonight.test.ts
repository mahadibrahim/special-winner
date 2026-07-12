import { describe, it, expect } from "vitest";
import {
  todayWindow,
  formatSessionTime,
  formatTodayLabel,
  facilityLabel,
  skillChip,
} from "@/lib/soccerone/tonight";

describe("todayWindow", () => {
  it("spans from now until the next local midnight in America/New_York", () => {
    // 2026-07-12T18:00:00Z == 2:00 PM EDT on Sat Jul 12.
    const now = new Date("2026-07-12T18:00:00Z");
    const { fromIso, toIso } = todayWindow(now);
    expect(fromIso).toBe(now.toISOString());
    // Local midnight (2026-07-13 00:00 EDT) == 2026-07-13T04:00:00Z.
    expect(toIso).toBe("2026-07-13T04:00:00.000Z");
  });

  it("handles late-night now (11 PM local)", () => {
    // 2026-07-13T03:00:00Z == 11:00 PM EDT on Sun Jul 12.
    const now = new Date("2026-07-13T03:00:00Z");
    const { toIso } = todayWindow(now);
    expect(toIso).toBe("2026-07-13T04:00:00.000Z");
  });
});

describe("formatSessionTime", () => {
  it("formats an ISO instant as a local time", () => {
    expect(formatSessionTime("2026-07-12T23:00:00Z")).toBe("7:00 PM");
  });
});

describe("formatTodayLabel", () => {
  it("formats the local date as an uppercase short label", () => {
    expect(formatTodayLabel(new Date("2026-07-12T18:00:00Z"))).toBe("SUN JUL 12");
  });
});

describe("facilityLabel", () => {
  it("maps venue names to short facility labels", () => {
    expect(facilityLabel("SoccerOne Worthington — Field 2")).toBe("Worthington");
    expect(facilityLabel("Downtown Columbus Court")).toBe("Downtown");
    expect(facilityLabel("Starr Ave Indoor")).toBe("Downtown");
    expect(facilityLabel("Some Other Venue")).toBe("Some Other Venue");
    expect(facilityLabel(null)).toBe("");
  });
});

describe("skillChip", () => {
  it("maps API skill levels to display chips", () => {
    expect(skillChip("recreational")).toBe("REC");
    expect(skillChip("intermediate")).toBe("INTERMEDIATE");
    expect(skillChip("advanced")).toBe("ADVANCED");
    expect(skillChip("all_levels")).toBe("OPEN");
  });
});
