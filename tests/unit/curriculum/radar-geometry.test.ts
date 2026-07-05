import { describe, expect, it } from "vitest";
import { radarPoints } from "@/lib/curriculum/radar-geometry";

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
});
