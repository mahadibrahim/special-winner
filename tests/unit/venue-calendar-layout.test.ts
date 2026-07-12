import { describe, it, expect } from "vitest";
import {
  timeToRow,
  blockRows,
  columnsForSpaces,
  clampRowsToWindow,
  assignLanes,
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

  describe("assignLanes", () => {
    it("gives every block lane 0 / count 1 when nothing overlaps", () => {
      const blocks = [
        { id: "a", rowStart: 1, rowEnd: 3 },
        { id: "b", rowStart: 3, rowEnd: 5 }, // touches at row 3, half-open: no overlap
        { id: "c", rowStart: 8, rowEnd: 10 },
      ];
      const lanes = assignLanes(blocks);
      expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 1 });
      expect(lanes.get("b")).toEqual({ lane: 0, laneCount: 1 });
      expect(lanes.get("c")).toEqual({ lane: 0, laneCount: 1 });
    });

    it("splits a simple overlapping pair into two lanes", () => {
      const blocks = [
        { id: "a", rowStart: 1, rowEnd: 4 },
        { id: "b", rowStart: 2, rowEnd: 5 },
      ];
      const lanes = assignLanes(blocks);
      expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 2 });
      expect(lanes.get("b")).toEqual({ lane: 1, laneCount: 2 });
    });

    it("gives three mutually-overlapping blocks three lanes", () => {
      // A[1,5) B[2,6) C[3,7) — all three overlap simultaneously at rows [3,5).
      const blocks = [
        { id: "a", rowStart: 1, rowEnd: 5 },
        { id: "b", rowStart: 2, rowEnd: 6 },
        { id: "c", rowStart: 3, rowEnd: 7 },
      ];
      const lanes = assignLanes(blocks);
      expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 3 });
      expect(lanes.get("b")).toEqual({ lane: 1, laneCount: 3 });
      expect(lanes.get("c")).toEqual({ lane: 2, laneCount: 3 });
    });

    // A pure chain: A overlaps B, B overlaps C, but A and C never overlap
    // each other. They're still ONE connected cluster (linked through B),
    // but peak concurrency within that cluster is only 2 (A+B, then B+C —
    // never all three at once), so laneCount must be 2, not 3. A and C can
    // share lane 0 since they never coexist.
    it("treats a pure chain as one cluster with peak concurrency 2, not 3", () => {
      const blocks = [
        { id: "a", rowStart: 1, rowEnd: 3 },
        { id: "b", rowStart: 2, rowEnd: 4 },
        { id: "c", rowStart: 3, rowEnd: 5 },
      ];
      const lanes = assignLanes(blocks);
      expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 2 });
      expect(lanes.get("b")).toEqual({ lane: 1, laneCount: 2 });
      expect(lanes.get("c")).toEqual({ lane: 0, laneCount: 2 });
    });

    // Staging-pile case: N identical intervals (e.g. a bunch of walk-ins
    // logged at the exact same start/end) must each get their own lane.
    it("gives N identical intervals lanes 0..N-1 with count N", () => {
      const blocks = Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        rowStart: 4,
        rowEnd: 8,
      }));
      const lanes = assignLanes(blocks);
      const seenLanes = blocks.map((b) => lanes.get(b.id)!.lane).sort((x, y) => x - y);
      expect(seenLanes).toEqual([0, 1, 2, 3, 4]);
      for (const b of blocks) {
        expect(lanes.get(b.id)!.laneCount).toBe(5);
      }
    });

    it("returns an empty map for no blocks", () => {
      expect(assignLanes([]).size).toBe(0);
    });

    // Determinism: upstream row order is unspecified (DB result order), so
    // an identical-interval pile must land on the SAME lanes regardless of
    // input order — otherwise blocks visibly swap positions between reloads.
    it("assigns identical-interval piles the same lanes regardless of input order", () => {
      const blocks = ["s3", "s0", "s4", "s1", "s2"].map((id) => ({
        id,
        rowStart: 4,
        rowEnd: 8,
      }));
      const shuffled = [blocks[4], blocks[1], blocks[3], blocks[0], blocks[2]];

      const lanesA = assignLanes(blocks);
      const lanesB = assignLanes(shuffled);
      for (const b of blocks) {
        expect(lanesB.get(b.id)).toEqual(lanesA.get(b.id));
      }
      // And the assignment itself is pinned: id order (localeCompare) wins
      // the tiebreak, so s0..s4 get lanes 0..4.
      for (let i = 0; i < 5; i++) {
        expect(lanesA.get(`s${i}`)).toEqual({ lane: i, laneCount: 5 });
      }
    });

    // Composed clamp→lanes interaction: two off-hours sessions that only
    // "overlap" AFTER clamping to the grid window (e.g. two pickup games
    // logged at 1am and 3am, both clamped to row 1 of an 8am grid) must
    // still split into separate lanes — lanes resolve the VISUAL overlap.
    it("lanes two off-hours sessions clamped onto the same row", () => {
      const a = clampRowsToWindow(-14, -10, 26); // → rows 1–2
      const b = clampRowsToWindow(-10, -7, 26);  // → rows 1–2
      const lanes = assignLanes([
        { id: "a", rowStart: a.rowStart, rowEnd: a.rowEnd },
        { id: "b", rowStart: b.rowStart, rowEnd: b.rowEnd },
      ]);
      expect(lanes.get("a")).toEqual({ lane: 0, laneCount: 2 });
      expect(lanes.get("b")).toEqual({ lane: 1, laneCount: 2 });
    });
  });
});
