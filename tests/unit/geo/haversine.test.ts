import { describe, it, expect } from "vitest";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(39.9612, -82.9988, 39.9612, -82.9988)).toBe(0);
  });

  it("returns ~111km for 1 degree of latitude", () => {
    const meters = haversineDistanceMeters(0, 0, 1, 0);
    // 1 degree of latitude is ~111,320m; allow a small tolerance for the
    // mean-earth-radius approximation.
    expect(meters).toBeGreaterThan(110900);
    expect(meters).toBeLessThan(111700);
  });

  it("is symmetric regardless of point order", () => {
    const a = haversineDistanceMeters(39.9612, -82.9988, 40.0, -83.0);
    const b = haversineDistanceMeters(40.0, -83.0, 39.9612, -82.9988);
    expect(a).toBe(b);
  });

  it("matches a known short distance within 1m", () => {
    // Two points ~150m apart (roughly one venue-geofence radius), computed
    // via an independent great-circle calculator.
    const meters = haversineDistanceMeters(
      39.9612,
      -82.9988,
      39.96255,
      -82.9988,
    );
    // ~0.00135 deg lat ≈ 150.1m
    expect(meters).toBeGreaterThanOrEqual(149);
    expect(meters).toBeLessThanOrEqual(151);
  });

  it("rounds to the nearest meter", () => {
    const meters = haversineDistanceMeters(0, 0, 1, 0);
    expect(Number.isInteger(meters)).toBe(true);
  });
});
