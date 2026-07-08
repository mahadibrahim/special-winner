import { describe, it, expect } from "vitest";
import {
  computeGeofenceDecision,
  DEFAULT_GEOFENCE_RADIUS_M,
  MAX_TRUSTED_ACCURACY_M,
} from "@/lib/time-tracking/geofence";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

const VENUE_LAT = 39.9612;
const VENUE_LNG = -82.9988;
// ~170m north of the venue — a fixed offset used across several tests to
// derive exact boundary values via the real haversine distance rather than
// hand-computed approximations.
const OFFSET_LAT = VENUE_LAT + 0.00153;
const RAW_DISTANCE_M = haversineDistanceMeters(VENUE_LAT, VENUE_LNG, OFFSET_LAT, VENUE_LNG);

describe("constants", () => {
  it("DEFAULT_GEOFENCE_RADIUS_M is 150 meters", () => {
    expect(DEFAULT_GEOFENCE_RADIUS_M).toBe(150);
  });

  it("MAX_TRUSTED_ACCURACY_M is 200 meters", () => {
    expect(MAX_TRUSTED_ACCURACY_M).toBe(200);
  });
});

describe("computeGeofenceDecision — no_fix", () => {
  it("blocks when both coordinates are missing (permission denied / unavailable)", () => {
    const result = computeGeofenceDecision(VENUE_LAT, VENUE_LNG, null, null, null, null);
    expect(result).toEqual({
      state: "no_fix",
      distanceM: null,
      flagged: true,
      flagReason: "missing_location",
      blocked: true,
    });
  });

  it("blocks when only latitude is missing", () => {
    const result = computeGeofenceDecision(VENUE_LAT, VENUE_LNG, null, null, VENUE_LNG, 10);
    expect(result.state).toBe("no_fix");
    expect(result.blocked).toBe(true);
  });

  it("blocks when only longitude is missing", () => {
    const result = computeGeofenceDecision(VENUE_LAT, VENUE_LNG, null, VENUE_LAT, null, 10);
    expect(result.state).toBe("no_fix");
    expect(result.blocked).toBe(true);
  });

  it("blocks even when the venue itself has no coordinates configured", () => {
    const result = computeGeofenceDecision(null, null, null, null, null, null);
    expect(result.state).toBe("no_fix");
    expect(result.blocked).toBe(true);
  });
});

describe("computeGeofenceDecision — imprecise", () => {
  it("blocks when accuracy is missing even though coordinates are present", () => {
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT,
      VENUE_LNG,
      null,
    );
    expect(result).toEqual({
      state: "imprecise",
      distanceM: null,
      flagged: true,
      flagReason: "imprecise_location",
      blocked: true,
    });
  });

  it("blocks when accuracy is strictly greater than the 200m cap", () => {
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT,
      VENUE_LNG,
      201,
    );
    expect(result.state).toBe("imprecise");
    expect(result.blocked).toBe(true);
    expect(result.flagReason).toBe("imprecise_location");
  });

  it("does NOT treat exactly 200m accuracy as imprecise (boundary is inclusive of trust)", () => {
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT,
      VENUE_LNG,
      200,
    );
    expect(result.state).not.toBe("imprecise");
  });
});

describe("computeGeofenceDecision — no venue coordinates configured", () => {
  it("trusts an already-precise fix when the venue has no geofence coordinates", () => {
    const result = computeGeofenceDecision(null, null, null, VENUE_LAT, VENUE_LNG, 10);
    expect(result).toEqual({
      state: "inside",
      distanceM: null,
      flagged: false,
      flagReason: null,
      blocked: false,
    });
  });
});

describe("computeGeofenceDecision — inside", () => {
  it("is inside, not flagged, not blocked, at zero distance", () => {
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT,
      VENUE_LNG,
      10,
    );
    expect(result).toEqual({
      state: "inside",
      distanceM: 0,
      flagged: false,
      flagReason: null,
      blocked: false,
    });
  });

  it("boundary: distanceM exactly equal to radius is inside, not uncertain", () => {
    // Pick a radius equal to the raw distance itself (accuracy irrelevant
    // here since distanceM <= radius is checked before the accuracy term).
    const radius = Math.round(RAW_DISTANCE_M);
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      radius,
      OFFSET_LAT,
      VENUE_LNG,
      10,
    );
    expect(result.distanceM).toBeLessThanOrEqual(radius);
    expect(result.state).toBe("inside");
    expect(result.blocked).toBe(false);
  });

  it("honors a per-venue radius override wider than the default", () => {
    // ~300m north — outside the 150m default, inside a 500m override.
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      500,
      VENUE_LAT + 0.0027,
      VENUE_LNG,
      10,
    );
    expect(result.state).toBe("inside");
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(false);
  });
});

describe("computeGeofenceDecision — uncertain (out-of-range but accuracy-explainable)", () => {
  it("flags but does not block when distance minus accuracy is still within radius", () => {
    // RAW_DISTANCE_M (~170m) is outside the 150m default radius, but
    // accuracy 50 makes distanceM - accuracyM (~120m) fall back within it.
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      OFFSET_LAT,
      VENUE_LNG,
      50,
    );
    expect(RAW_DISTANCE_M).toBeGreaterThan(DEFAULT_GEOFENCE_RADIUS_M);
    expect(result.state).toBe("uncertain");
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe("out_of_range");
    expect(result.distanceM).toBeCloseTo(RAW_DISTANCE_M, 0);
  });

  it("boundary: distanceM - accuracyM exactly equal to radius is uncertain, not outside", () => {
    // Choose radius = distanceM - accuracyM exactly, using the real
    // haversine distance for this fixed offset.
    const accuracyM = 30;
    const radius = Math.round(RAW_DISTANCE_M) - accuracyM;
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      radius,
      OFFSET_LAT,
      VENUE_LNG,
      accuracyM,
    );
    expect(result.state).toBe("uncertain");
    expect(result.blocked).toBe(false);
  });

  it("honors a narrower per-venue radius for the uncertain boundary", () => {
    // ~50m north — outside a 20m override radius, but within accuracy 40.
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      20,
      VENUE_LAT + 0.00045,
      VENUE_LNG,
      40,
    );
    expect(result.state).toBe("uncertain");
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(true);
  });
});

describe("computeGeofenceDecision — outside (blocked, not accuracy-explainable)", () => {
  it("blocks when distance minus accuracy still exceeds the radius", () => {
    // ~1km north — well outside the 150m default, accuracy 50 can't explain it.
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT + 0.01,
      VENUE_LNG,
      50,
    );
    expect(result.state).toBe("outside");
    expect(result.blocked).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.flagReason).toBe("out_of_range");
    expect(result.distanceM).toBeGreaterThan(150);
  });

  it("boundary: distanceM - accuracyM strictly greater than radius is outside", () => {
    // One meter past the exact "uncertain" boundary radius.
    const accuracyM = 30;
    const radius = Math.round(RAW_DISTANCE_M) - accuracyM - 1;
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      radius,
      OFFSET_LAT,
      VENUE_LNG,
      accuracyM,
    );
    expect(result.state).toBe("outside");
    expect(result.blocked).toBe(true);
  });

  it("cannot be gamed by an implausibly good accuracy claim at a real 1km distance", () => {
    // Even a claimed accuracy of 1m at 1km away is still clearly outside —
    // the accuracy allowance doesn't help an attacker "explain away" a
    // couch clock-in by lying in the other direction (claiming great
    // accuracy); it would just make it MORE clearly outside.
    const result = computeGeofenceDecision(
      VENUE_LAT,
      VENUE_LNG,
      null,
      VENUE_LAT + 0.01,
      VENUE_LNG,
      1,
    );
    expect(result.state).toBe("outside");
    expect(result.blocked).toBe(true);
  });
});
