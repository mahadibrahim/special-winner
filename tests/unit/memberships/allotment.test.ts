import { describe, it, expect } from "vitest";
import {
  computeAllotmentRemaining,
  allotmentPeriodStart,
} from "@/lib/memberships/allotment";

describe("computeAllotmentRemaining", () => {
  it("returns 0 when benefits are missing", () => {
    expect(computeAllotmentRemaining(null, 0)).toBe(0);
    expect(computeAllotmentRemaining(undefined, 0)).toBe(0);
  });

  it("returns 0 for unlimited tiers (the unlimited branch handles them)", () => {
    // Even with a free_pickup_per_month set, unlimited wins → no allotment draw.
    expect(
      computeAllotmentRemaining(
        { unlimited_pickup: true, free_pickup_per_month: 8 },
        0,
      ),
    ).toBe(0);
  });

  it("returns 0 when there is no free_pickup_per_month benefit", () => {
    expect(computeAllotmentRemaining({ rental_discount_pct: 10 } as never, 0)).toBe(0);
    expect(computeAllotmentRemaining({ free_pickup_per_month: 0 }, 0)).toBe(0);
  });

  it("returns the full cap when nothing has been used", () => {
    expect(computeAllotmentRemaining({ free_pickup_per_month: 8 }, 0)).toBe(8);
  });

  it("subtracts usage from the cap", () => {
    expect(computeAllotmentRemaining({ free_pickup_per_month: 8 }, 3)).toBe(5);
  });

  it("floors at 0 when usage meets or exceeds the cap", () => {
    expect(computeAllotmentRemaining({ free_pickup_per_month: 8 }, 8)).toBe(0);
    expect(computeAllotmentRemaining({ free_pickup_per_month: 8 }, 11)).toBe(0);
  });

  it("treats negative/fractional usage defensively", () => {
    expect(computeAllotmentRemaining({ free_pickup_per_month: 4 }, -2)).toBe(4);
    expect(computeAllotmentRemaining({ free_pickup_per_month: 4 }, 1.9)).toBe(3);
  });
});

describe("allotmentPeriodStart", () => {
  it("returns the first instant of the current UTC month", () => {
    const start = allotmentPeriodStart(new Date("2026-06-13T18:41:00.000Z"));
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("handles the first of the month", () => {
    const start = allotmentPeriodStart(new Date("2026-01-01T00:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
