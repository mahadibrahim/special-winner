/**
 * dob.ts — helpers for birth-date values that may be unknown.
 *
 * Walk-up adults use the sentinel "1900-01-01" when no DOB is collected at
 * roll-call (see addWalkUpToPickup / ADULT_SENTINEL_DOB). Treat that value —
 * and null/empty — as "unknown DOB" rather than a real birth date.
 */

/** Sentinel DOB written by addWalkUpToPickup for adults whose DOB is unknown. */
export const ADULT_SENTINEL_DOB = "1900-01-01";

/**
 * Returns true only when `birthDate` is a real, known birth date.
 * Returns false for null, empty string, and the walk-up sentinel "1900-01-01".
 */
export function isKnownDob(birthDate: string | null | undefined): boolean {
  if (!birthDate) return false;
  return birthDate !== ADULT_SENTINEL_DOB;
}
