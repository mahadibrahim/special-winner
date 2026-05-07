import { describe, it, expect } from "vitest";
import { computeExpectedAt } from "../../../src/lib/activity-tracking/dsl";

const game = {
  scheduledAt: new Date("2026-06-03T18:00:00Z"), // Wed Jun 3 6pm UTC kickoff
  durationMin: null as number | null,
};
const orgTz = "America/New_York";

describe("computeExpectedAt", () => {
  it("parses T-90min as 90 minutes before scheduledAt", () => {
    expect(computeExpectedAt("T-90min", game, orgTz)).toEqual(new Date("2026-06-03T16:30:00Z"));
  });
  it("parses T+5min as 5 minutes after scheduledAt", () => {
    expect(computeExpectedAt("T+5min", game, orgTz)).toEqual(new Date("2026-06-03T18:05:00Z"));
  });
  it("parses T-72h as 72 hours before scheduledAt", () => {
    expect(computeExpectedAt("T-72h", game, orgTz)).toEqual(new Date("2026-05-31T18:00:00Z"));
  });
  it("parses T+24h as 24 hours after scheduledAt", () => {
    expect(computeExpectedAt("T+24h", game, orgTz)).toEqual(new Date("2026-06-04T18:00:00Z"));
  });
  it("parses HH:MM as that day's local time in org tz", () => {
    // 21:00 in America/New_York on 2026-06-03 = 01:00 UTC on 2026-06-04 (EDT, UTC-4)
    expect(computeExpectedAt("21:00", game, orgTz)).toEqual(new Date("2026-06-04T01:00:00Z"));
  });
  it("parses phase_end heuristics", () => {
    // pre_game phase_end = T-0 (kickoff)
    expect(computeExpectedAt("phase_end", game, orgTz, "pre_game")).toEqual(game.scheduledAt);
    // post_game phase_end = T+30min
    expect(computeExpectedAt("phase_end", game, orgTz, "post_game")).toEqual(new Date("2026-06-03T18:30:00Z"));
    // post_day phase_end = T+72h
    expect(computeExpectedAt("phase_end", game, orgTz, "post_day")).toEqual(new Date("2026-06-06T18:00:00Z"));
  });
  it("returns null for trigger+Nmin (deferred bootstrap)", () => {
    expect(computeExpectedAt("trigger+5min", game, orgTz)).toBeNull();
  });
  it("throws for unparseable DSL", () => {
    expect(() => computeExpectedAt("not-a-real-form", game, orgTz)).toThrow();
  });
});
