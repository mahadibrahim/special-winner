import { describe, expect, it } from "vitest";
import { radarPoints, sanitizeAxisValue } from "@/lib/curriculum/radar-geometry";

describe("sanitizeAxisValue", () => {
  it("returns 0 for NaN", () => {
    expect(sanitizeAxisValue(NaN, 5)).toBe(0);
  });
  it("returns 0 for Infinity", () => {
    expect(sanitizeAxisValue(Infinity, 5)).toBe(0);
  });
  it("returns 0 for -Infinity", () => {
    expect(sanitizeAxisValue(-Infinity, 5)).toBe(0);
  });
  it("clamps negative values to 0", () => {
    expect(sanitizeAxisValue(-1, 5)).toBe(0);
  });
  it("clamps values above max to max", () => {
    expect(sanitizeAxisValue(7.5, 5)).toBe(5);
  });
  it("passes through valid in-range values", () => {
    expect(sanitizeAxisValue(3.2, 5)).toBe(3.2);
  });
  it("passes through boundary values", () => {
    expect(sanitizeAxisValue(0, 5)).toBe(0);
    expect(sanitizeAxisValue(5, 5)).toBe(5);
  });
});

describe("radarPoints", () => {
  it("places a full-scale 4-axis polygon at the cardinal points", () => {
    const pts = radarPoints([5, 5, 5, 5], 5, 200);
    // axis 0 points straight up from center (100,100)
    expect(pts[0][0]).toBeCloseTo(100, 5);
    expect(pts[0][1]).toBeCloseTo(0, 5);
    expect(pts).toHaveLength(4);
  });
  it("scales values linearly toward the center", () => {
    const pts = radarPoints([2.5, 0, 0, 0], 5, 200);
    expect(pts[0][1]).toBeCloseTo(50, 5); // halfway up
    expect(pts[1]).toEqual([100, 100]); // zero sits at center
  });
  it("sanitizes NaN to 0 before computing geometry", () => {
    const pts = radarPoints([NaN, 0, 0, 0], 5, 200);
    expect(pts[0]).toEqual([100, 100]); // NaN becomes 0, which is center
  });
  it("clamps out-of-range values before computing geometry", () => {
    const pts = radarPoints([7.5, 0, 0, 0], 5, 200);
    expect(pts[0][1]).toBeCloseTo(0, 5); // 7.5 clamped to 5, which is outer edge
  });
});
