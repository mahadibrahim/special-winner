import { describe, it, expect } from "vitest";
import {
  computeGeofenceFlag,
  DEFAULT_GEOFENCE_RADIUS_M,
} from "@/lib/time-tracking/geofence";

const VENUE_LAT = 39.9612;
const VENUE_LNG = -82.9988;

describe("DEFAULT_GEOFENCE_RADIUS_M", () => {
  it("is 150 meters", () => {
    expect(DEFAULT_GEOFENCE_RADIUS_M).toBe(150);
  });
});

describe("computeGeofenceFlag", () => {
  it("never flags when the venue has no coordinates configured", () => {
    const result = computeGeofenceFlag(
      { latitude: null, longitude: null, radiusM: null },
      { lat: 0, lng: 0 },
    );
    expect(result).toEqual({ flagged: false, flagReason: null, distanceM: null });
  });

  it("never flags when the venue has no coordinates, even with no client location", () => {
    const result = computeGeofenceFlag(
      { latitude: null, longitude: null, radiusM: null },
      null,
    );
    expect(result).toEqual({ flagged: false, flagReason: null, distanceM: null });
  });

  it("flags missing_location when the client didn't supply a location", () => {
    const result = computeGeofenceFlag(
      { latitude: VENUE_LAT, longitude: VENUE_LNG, radiusM: null },
      null,
    );
    expect(result).toEqual({
      flagged: true,
      flagReason: "missing_location",
      distanceM: null,
    });
  });

  it("does not flag when within the default radius", () => {
    const result = computeGeofenceFlag(
      { latitude: VENUE_LAT, longitude: VENUE_LNG, radiusM: null },
      { lat: VENUE_LAT, lng: VENUE_LNG },
    );
    expect(result.flagged).toBe(false);
    expect(result.flagReason).toBeNull();
    expect(result.distanceM).toBe(0);
  });

  it("flags out_of_range when outside the default radius", () => {
    // ~1km north — well outside the 150m default.
    const result = computeGeofenceFlag(
      { latitude: VENUE_LAT, longitude: VENUE_LNG, radiusM: null },
      { lat: VENUE_LAT + 0.01, lng: VENUE_LNG },
    );
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe("out_of_range");
    expect(result.distanceM).toBeGreaterThan(150);
  });

  it("honors a per-venue radius override wider than the default", () => {
    // ~300m north — outside the 150m default, inside a 500m override.
    const result = computeGeofenceFlag(
      { latitude: VENUE_LAT, longitude: VENUE_LNG, radiusM: 500 },
      { lat: VENUE_LAT + 0.0027, lng: VENUE_LNG },
    );
    expect(result.flagged).toBe(false);
    expect(result.flagReason).toBeNull();
    expect(result.distanceM).toBeLessThan(500);
  });

  it("honors a per-venue radius override narrower than the default", () => {
    // ~50m north — inside the 150m default, outside a 20m override.
    const result = computeGeofenceFlag(
      { latitude: VENUE_LAT, longitude: VENUE_LNG, radiusM: 20 },
      { lat: VENUE_LAT + 0.00045, lng: VENUE_LNG },
    );
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe("out_of_range");
    expect(result.distanceM).toBeGreaterThan(20);
  });
});
