import { describe, it, expect } from "vitest";
import { weekBoundsFor, groupByDay, addWeeks } from "@/lib/dropin/week-schedule";

const TZ = "America/New_York";

describe("weekBoundsFor", () => {
  it("returns Mon 00:00 ET → next Mon 00:00 ET for a mid-week anchor", () => {
    // Wed 2026-07-22 15:00 UTC
    const { from, to } = weekBoundsFor(new Date("2026-07-22T15:00:00Z"), TZ);
    expect(from.toISOString()).toBe("2026-07-20T04:00:00.000Z"); // Mon 00:00 EDT
    expect(to.toISOString()).toBe("2026-07-27T04:00:00.000Z");
  });
  it("handles a UTC instant that is still the previous day in ET", () => {
    // 2026-07-20T02:00Z is Sun 22:00 ET → week starting Mon Jul 13 ET
    const { from } = weekBoundsFor(new Date("2026-07-20T02:00:00Z"), TZ);
    expect(from.toISOString()).toBe("2026-07-13T04:00:00.000Z");
  });
});

describe("groupByDay", () => {
  it("buckets sessions into org-tz days and keeps empty days", () => {
    const sessions = [
      { startsAt: "2026-07-25T14:00:00.000Z" }, // Sat 10:00 ET
      { startsAt: "2026-07-26T01:00:00.000Z" }, // Sat 21:00 ET (NOT Sunday)
    ];
    const days = groupByDay(sessions, TZ);
    expect(days).toHaveLength(7);
    const sat = days.find((d) => d.dayKey === "2026-07-25")!;
    expect(sat.sessions).toHaveLength(2);
    expect(sat.label).toBe("SAT Jul 25");
    expect(days.find((d) => d.dayKey === "2026-07-26")!.sessions).toHaveLength(0);
  });

  it("anchors an empty session list to the given anchor, not the current week", () => {
    // Without an anchor this would fall back to `new Date()` and wrongly
    // render whatever week the test happens to run in.
    const anchor = new Date("2026-07-22T15:00:00Z"); // Wed, week of Jul 20-26 ET
    const days = groupByDay([], TZ, anchor);
    expect(days).toHaveLength(7);
    expect(days[0].dayKey).toBe("2026-07-20");
    expect(days[6].dayKey).toBe("2026-07-26");
  });

  it("prefers an explicit anchor over sessions[0] when both are present", () => {
    const sessions = [{ startsAt: "2026-07-25T14:00:00.000Z" }]; // week of Jul 20-26 ET
    const anchor = new Date("2026-08-05T15:00:00Z"); // a different week (Aug 3-9 ET)
    const days = groupByDay(sessions, TZ, anchor);
    expect(days[0].dayKey).toBe("2026-08-03");
    // The session itself isn't in this window, so it's simply dropped from
    // the bucketed result (its startsAt doesn't match any of these 7 days).
    expect(days.flatMap((d) => d.sessions)).toHaveLength(0);
  });
});

describe("addWeeks", () => {
  it("moves exactly 7 days", () => {
    expect(addWeeks(new Date("2026-07-22T15:00:00Z"), -1).toISOString()).toBe(
      "2026-07-15T15:00:00.000Z",
    );
  });
});
