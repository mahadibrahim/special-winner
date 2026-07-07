import { describe, it, expect } from "vitest";
import {
  aggregateHourlyLabor,
  type HourlyShiftInput,
} from "@/lib/payroll/aggregate-hours";

function shift(
  userId: string,
  role: string,
  clockInAt: string,
  clockOutAt: string | null,
  flaggedOutOfRange = false,
): HourlyShiftInput {
  return {
    userId,
    role,
    clockInAt: new Date(clockInAt),
    clockOutAt: clockOutAt ? new Date(clockOutAt) : null,
    flaggedOutOfRange,
  };
}

describe("aggregateHourlyLabor", () => {
  it("sums closed shift durations, including flagged shifts", () => {
    const rows = aggregateHourlyLabor([
      shift("u1", "coach", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"), // 1h
      shift("u1", "coach", "2026-01-15T15:00:00Z", "2026-01-15T16:30:00Z"), // 1.5h
      shift(
        "u1",
        "coach",
        "2026-01-15T17:00:00Z",
        "2026-01-15T17:30:00Z",
        true,
      ), // 0.5h, flagged
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "u1",
      role: "coach",
      totalHours: 3,
      closedShiftCount: 3,
      flaggedShiftCount: 1,
      openShiftCount: 0,
    });
  });

  it("excludes open shifts from the hour sum but counts them separately", () => {
    const rows = aggregateHourlyLabor([
      shift("u1", "coach", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"), // 1h closed
      shift("u1", "coach", "2026-01-15T18:00:00Z", null), // open
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totalHours: 1,
      closedShiftCount: 1,
      flaggedShiftCount: 0,
      openShiftCount: 1,
    });
  });

  it("groups separately by (userId, role) — same user, different roles", () => {
    const rows = aggregateHourlyLabor([
      shift("u1", "coach", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"),
      shift("u1", "venue_manager", "2026-01-15T15:00:00Z", "2026-01-15T17:00:00Z"),
    ]);
    expect(rows).toHaveLength(2);
    const coachRow = rows.find((r) => r.role === "coach");
    const vmRow = rows.find((r) => r.role === "venue_manager");
    expect(coachRow?.totalHours).toBe(1);
    expect(vmRow?.totalHours).toBe(2);
  });

  it("returns rows sorted deterministically by role then userId", () => {
    const rows = aggregateHourlyLabor([
      shift("u2", "venue_manager", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"),
      shift("u1", "coach", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"),
      shift("u2", "coach", "2026-01-15T13:00:00Z", "2026-01-15T14:00:00Z"),
    ]);
    expect(rows.map((r) => `${r.role}:${r.userId}`)).toEqual([
      "coach:u1",
      "coach:u2",
      "venue_manager:u2",
    ]);
  });

  it("returns an empty array for no shifts", () => {
    expect(aggregateHourlyLabor([])).toEqual([]);
  });

  it("rounds totalHours to 2 decimal places", () => {
    const rows = aggregateHourlyLabor([
      // 1/3 hour = 20 minutes, repeated 3x -> should sum cleanly to 1.00,
      // not accumulate floating point drift.
      shift("u1", "coach", "2026-01-15T13:00:00Z", "2026-01-15T13:20:00Z"),
      shift("u1", "coach", "2026-01-15T14:00:00Z", "2026-01-15T14:20:00Z"),
      shift("u1", "coach", "2026-01-15T15:00:00Z", "2026-01-15T15:20:00Z"),
    ]);
    expect(rows[0].totalHours).toBe(1);
  });
});
