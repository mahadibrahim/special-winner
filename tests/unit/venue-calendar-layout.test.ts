import { describe, it, expect } from "vitest";
import { timeToRow, blockRows, columnsForSpaces } from "@/lib/venue/calendar-layout";

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
});
