import { describe, it, expect } from "vitest";
import { rangesOverlap, subtractBusyBlocks } from "@/lib/rentals/overlap";

const d = (iso: string) => new Date(iso);

describe("rangesOverlap", () => {
  it("returns true for overlapping ranges", () => {
    expect(
      rangesOverlap(
        d("2026-06-01T18:00:00Z"), d("2026-06-01T20:00:00Z"),
        d("2026-06-01T19:00:00Z"), d("2026-06-01T21:00:00Z"),
      ),
    ).toBe(true);
  });
  it("returns false for touching-but-not-overlapping ranges", () => {
    expect(
      rangesOverlap(
        d("2026-06-01T18:00:00Z"), d("2026-06-01T20:00:00Z"),
        d("2026-06-01T20:00:00Z"), d("2026-06-01T21:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("subtractBusyBlocks", () => {
  it("returns the whole window when there are no busy blocks", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"), [],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
  it("splits the window around a busy block", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"),
      [{ startsAt: d("2026-06-01T18:00:00Z"), endsAt: d("2026-06-01T19:00:00Z") }],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T18:00:00Z") },
      { startsAt: d("2026-06-01T19:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
  it("merges adjacent/overlapping busy blocks before subtracting", () => {
    const free = subtractBusyBlocks(
      d("2026-06-01T16:00:00Z"), d("2026-06-01T22:00:00Z"),
      [
        { startsAt: d("2026-06-01T18:00:00Z"), endsAt: d("2026-06-01T19:30:00Z") },
        { startsAt: d("2026-06-01T19:00:00Z"), endsAt: d("2026-06-01T20:00:00Z") },
      ],
    );
    expect(free).toEqual([
      { startsAt: d("2026-06-01T16:00:00Z"), endsAt: d("2026-06-01T18:00:00Z") },
      { startsAt: d("2026-06-01T20:00:00Z"), endsAt: d("2026-06-01T22:00:00Z") },
    ]);
  });
});
