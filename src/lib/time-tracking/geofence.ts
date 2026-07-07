/**
 * Decide whether a staff clock-in/out should be flagged for being outside
 * the venue's geofence. Flag-not-block is permanent product behavior (owner
 * decision #2, docs/superpowers/plans/2026-07-07-time-tracking.md) — this
 * function never blocks a clock-in/out, it only classifies it.
 *
 * Pure function — no DB/I/O. Callers resolve the venue row and the
 * browser Geolocation reading (or lack thereof) before calling in.
 */
import { haversineDistanceMeters } from "@/lib/geo/haversine";

export const DEFAULT_GEOFENCE_RADIUS_M = 150;

export interface GeofenceVenue {
  /** Null when the venue has no geofence coordinates configured. */
  latitude: number | null;
  longitude: number | null;
  /** Null falls back to DEFAULT_GEOFENCE_RADIUS_M. */
  radiusM: number | null;
}

export interface GeofenceClientLocation {
  lat: number;
  lng: number;
}

export type GeofenceFlagReason = "missing_location" | "out_of_range";

export interface GeofenceFlagResult {
  flagged: boolean;
  flagReason: GeofenceFlagReason | null;
  distanceM: number | null;
}

const NOT_FLAGGED: GeofenceFlagResult = {
  flagged: false,
  flagReason: null,
  distanceM: null,
};

export function computeGeofenceFlag(
  venue: GeofenceVenue,
  clientLocation: GeofenceClientLocation | null,
): GeofenceFlagResult {
  // No venue coordinates configured — nothing to compare against, so never
  // flag regardless of whether the client supplied a location.
  if (venue.latitude == null || venue.longitude == null) {
    return NOT_FLAGGED;
  }

  if (!clientLocation) {
    return { flagged: true, flagReason: "missing_location", distanceM: null };
  }

  const radiusM = venue.radiusM ?? DEFAULT_GEOFENCE_RADIUS_M;
  const distanceM = haversineDistanceMeters(
    venue.latitude,
    venue.longitude,
    clientLocation.lat,
    clientLocation.lng,
  );

  if (distanceM <= radiusM) {
    return { flagged: false, flagReason: null, distanceM };
  }

  return { flagged: true, flagReason: "out_of_range", distanceM };
}
