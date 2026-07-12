import { describe, it, expect } from "vitest";
import {
  timeToRow,
  blockRows,
  columnsForSpaces,
  clampRowsToWindow,
} from "@/lib/venue/calendar-layout";

// All tests use "America/New_York" explicitly (EDT = UTC-4 in June 2026).
// UTC instants are chosen so their wall-clock time in New_York is unambiguous.

describe("calendar-layout", () => {
  it("maps 9:00 AM ET to row 3 with an 8am day start (half-hour rows, 1-based)", () => {
    // 2026-06-19T13:00:00Z = 9:00 AM EDT (UTC-4)
    expect(timeToRow("2026-06-19T13:00:00Z", 8, "America/New_York")).toBe(3);
    // 2026-06-19T12:00:00Z = 8:00 AM EDT → row 1
    expect(timeToRow("2026-06-19T12:00:00Z", 8, "America/New_York")).toBe(1);
    // 2026-06-19T14:30:00Z = 10:30 AM EDT → row 6
    expect(timeToRow("2026-06-19T14:30:00Z", 8, "America/New_York")).toBe(6);
  });
  it("computes a block's row span", () => {
    // 9:00 AM–10:00 AM ET = rows 3–5
    expect(
      blockRows(
        "2026-06-19T13:00:00Z",
        "2026-06-19T14:00:00Z",
        8,
        "America/New_York",
      ),
    ).toEqual({ rowStart: 3, rowEnd: 5 });
  });
  it("assigns space columns starting at 2 (col 1 is the gutter)", () => {
    expect(columnsForSpaces([{ id: "a", name: "Field 1" }, { id: "b", name: "Court A" }]))
      .toEqual([{ id: "a", name: "Field 1", index: 2 }, { id: "b", name: "Court A", index: 3 }]);
  });

  describe("clampRowsToWindow", () => {
    // A pickup session created just after midnight ET spans well before an
    // 8am-start business-hours grid (e.g. rows -14 to -10 for a 2-hour
    // session starting at 00:41). Unclamped, ScheduleCalendar would render
    // this at a large negative `top` offset, escaping the grid container.
    it("clamps a block that starts and ends before the grid window", () => {
      expect(clampRowsToWindow(-14, -10, 26)).toEqual({ rowStart: 1, rowEnd: 2, clamped: true });
    });

    it("clamps a block that starts and ends after the grid window", () => {
      expect(clampRowsToWindow(40, 44, 26)).toEqual({ rowStart: 26, rowEnd: 27, clamped: true });
    });

    it("clamps only the overflowing edge when a block straddles the window start", () => {
      expect(clampRowsToWindow(-3, 4, 26)).toEqual({ rowStart: 1, rowEnd: 4, clamped: true });
    });

    it("clamps only the overflowing edge when a block straddles the window end", () => {
      expect(clampRowsToWindow(24, 30, 26)).toEqual({ rowStart: 24, rowEnd: 27, clamped: true });
    });

    it("leaves an in-window block untouched", () => {
      expect(clampRowsToWindow(3, 5, 26)).toEqual({ rowStart: 3, rowEnd: 5, clamped: false });
    });

    // Off-hours audit case: a 2:00 AM session (well before an 8am-start grid)
    // must be flagged so the UI can render an "off-hours" chip instead of
    // silently rendering a clamped block that looks like a normal 8am slot.
    it("flags clamped blocks so the UI can mark off-hours sessions", () => {
      expect(clampRowsToWindow(-10, -7, 26)).toMatchObject({ rowStart: 1, rowEnd: 2, clamped: true });
      expect(clampRowsToWindow(3, 5, 26)).toMatchObject({ rowStart: 3, rowEnd: 5, clamped: false });
    });
  });
});
