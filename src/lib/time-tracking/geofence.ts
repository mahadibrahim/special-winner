/**
 * Decide whether a staff/referee clock-in should be trusted, flagged for
 * review, or blocked outright, based on the venue's geofence and the
 * browser Geolocation fix's own precision.
 *
 * Supersedes the original flag-not-block `computeGeofenceFlag` (see git
 * history) per the owner's 2026-07-07 decision update
 * (docs/superpowers/plans/2026-07-07-time-tracking.md, "Owner decisions —
 * ANSWERED"): location capture is a condition of employment, so a clock-in
 * with no fix, or a fix too imprecise to verify presence, is now BLOCKED
 * (422) rather than recorded-with-flag. A fix that's precise enough but
 * still outside the venue radius is only blocked when the fix's own
 * accuracy can't explain the gap — otherwise it's flagged for admin review,
 * not blocked, so an on-site employee with a fuzzy indoor GPS fix isn't
 * stranded.
 *
 * Pure function — no DB/I/O. Callers resolve the venue row and the browser
 * Geolocation reading (or lack thereof, or its accuracy) before calling in.
 *
 * Honest limit (documented, not a blocker): a rooted phone running a
 * mock-GPS app can still spoof `coords` through any browser-based geofence.
 * Defeating that needs a native app + device attestation. This design
 * blocks casual gaming (couch clock-in, garbage-accuracy trick) and stores
 * accuracy for audit — sufficient for a rec operator; native hardening is a
 * future follow-up if spoofing becomes a real problem.
 */
import { haversineDistanceMeters } from "@/lib/geo/haversine";

export const DEFAULT_GEOFENCE_RADIUS_M = 150;

/**
 * A browser fix reporting worse than this many meters of accuracy (1-sigma,
 * per `coords.accuracy`) is too coarse to verify presence — and is also
 * exactly what a client could report to make an out-of-range distance look
 * "explainable" by accuracy alone. Capping it closes that trick.
 */
export const MAX_TRUSTED_ACCURACY_M = 200;

export type GeofenceState = "no_fix" | "imprecise" | "inside" | "uncertain" | "outside";

export type GeofenceFlagReason =
  | "missing_location"
  | "imprecise_location"
  | "out_of_range";

export interface GeofenceDecision {
  state: GeofenceState;
  /** Meters between the fix and the venue. Null when not computable (no fix, imprecise fix, or venue has no coordinates). */
  distanceM: number | null;
  /** True when the row should be surfaced for admin review (never true for a blocked decision that never becomes a row). */
  flagged: boolean;
  flagReason: GeofenceFlagReason | null;
  /** True when the caller must refuse the clock-in/check-in with a 422, not insert a row. */
  blocked: boolean;
}

function decision(
  state: GeofenceState,
  distanceM: number | null,
  flagged: boolean,
  flagReason: GeofenceFlagReason | null,
  blocked: boolean,
): GeofenceDecision {
  return { state, distanceM, flagged, flagReason, blocked };
}

/**
 * @param venueLat Venue latitude, or null if the venue has no geofence configured.
 * @param venueLng Venue longitude, or null if the venue has no geofence configured.
 * @param radiusM Per-venue radius override, or null to fall back to DEFAULT_GEOFENCE_RADIUS_M.
 * @param clockLat Client-reported latitude, or null if no fix was obtained (permission denied / unavailable / timeout).
 * @param clockLng Client-reported longitude, or null if no fix was obtained.
 * @param accuracyM Client-reported `coords.accuracy` in meters, or null if unavailable.
 */
export function computeGeofenceDecision(
  venueLat: number | null,
  venueLng: number | null,
  radiusM: number | null,
  clockLat: number | null,
  clockLng: number | null,
  accuracyM: number | null,
): GeofenceDecision {
  // No fix at all — permission denied, GPS unavailable, or timed out.
  // Condition of employment: this blocks, it does not flag-and-allow.
  if (clockLat == null || clockLng == null) {
    return decision("no_fix", null, true, "missing_location", true);
  }

  // Fix too coarse to trust (or accuracy simply wasn't reported) — closes
  // the "report a garbage accuracy so any distance looks explainable"
  // spoof. Blocks before a venue-coordinate comparison is even attempted.
  if (accuracyM == null || accuracyM > MAX_TRUSTED_ACCURACY_M) {
    return decision("imprecise", null, true, "imprecise_location", true);
  }

  // Venue has no geofence coordinates configured — nothing to compare the
  // (already-verified-precise) fix against, so trust it.
  if (venueLat == null || venueLng == null) {
    return decision("inside", null, false, null, false);
  }

  const radius = radiusM ?? DEFAULT_GEOFENCE_RADIUS_M;
  const distanceM = haversineDistanceMeters(venueLat, venueLng, clockLat, clockLng);

  if (distanceM <= radius) {
    return decision("inside", distanceM, false, null, false);
  }

  // Outside the radius, but the fix's own accuracy could plausibly explain
  // the gap (e.g. on-site with a fuzzy indoor fix) — flag for review, don't
  // strand the employee.
  if (distanceM - accuracyM <= radius) {
    return decision("uncertain", distanceM, true, "out_of_range", false);
  }

  // Outside the radius by more than the fix's own accuracy can explain —
  // a clear couch clock-in. Can't be gamed by a better-than-real accuracy
  // claim, since that would just shrink `distanceM - accuracyM` further.
  return decision("outside", distanceM, true, "out_of_range", true);
}
