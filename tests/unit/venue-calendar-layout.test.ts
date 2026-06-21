import { describe, it, expect } from "vitest";
import { timeToRow, blockRows, columnsForSpaces } from "@/lib/venue/calendar-layout";

describe("calendar-layout", () => {
  it("maps 9:00 to row 3 with an 8am day start (half-hour rows, 1-based)", () => {
    expect(timeToRow("2026-06-19T09:00:00Z", 8)).toBe(3);
    expect(timeToRow("2026-06-19T08:00:00Z", 8)).toBe(1);
    expect(timeToRow("2026-06-19T10:30:00Z", 8)).toBe(6);
  });
  it("computes a block's row span", () => {
    expect(blockRows("2026-06-19T09:00:00Z", "2026-06-19T10:00:00Z", 8)).toEqual({ rowStart: 3, rowEnd: 5 });
  });
  it("assigns space columns starting at 2 (col 1 is the gutter)", () => {
    expect(columnsForSpaces([{ id: "a", name: "Field 1" }, { id: "b", name: "Court A" }]))
      .toEqual([{ id: "a", name: "Field 1", index: 2 }, { id: "b", name: "Court A", index: 3 }]);
  });
});
