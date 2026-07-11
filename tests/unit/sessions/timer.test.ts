import { describe, it, expect } from "vitest";
import { segmentWindows, elapsedMinutes } from "@/lib/sessions/timer";

describe("segmentWindows", () => {
  it("accumulates start/end minutes in order", () => {
    expect(
      segmentWindows([
        { order: 0, durationMinutes: 10 },
        { order: 1, durationMinutes: 20 },
      ]),
    ).toEqual([
      { order: 0, startsAtMinute: 0, endsAtMinute: 10 },
      { order: 1, startsAtMinute: 10, endsAtMinute: 30 },
    ]);
  });
});

describe("elapsedMinutes", () => {
  it("computes fractional minutes since startedAt, clamped at 0", () => {
    const start = "2026-07-10T18:00:00.000Z";
    expect(elapsedMinutes(start, Date.parse("2026-07-10T18:07:30.000Z"))).toBeCloseTo(7.5);
    expect(elapsedMinutes(start, Date.parse("2026-07-10T17:59:00.000Z"))).toBe(0);
  });
});
