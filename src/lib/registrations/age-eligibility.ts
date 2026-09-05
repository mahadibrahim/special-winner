/**
 * Age-eligibility helpers for program registration.
 *
 * A child's age on a given date is computed from their birth date (YYYY-MM-DD).
 * A child who turns N on `onDate` itself is N (the birthday has "been reached"
 * that day).
 *
 * Pure functions; zero DB imports.
 */

/**
 * Compute age at a specific date.
 *
 * @param birthDate YYYY-MM-DD string
 * @param onDate Date to compute age on
 * @returns The age the person is/was on that date
 *
 * Note: this implementation mirrors the copy in src/lib/classes/book-child.ts:123-131.
 * Dedupe deferred to a later PR.
 */
export function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  let age = onDate.getUTCFullYear() - by;
  const monthDiff = onDate.getUTCMonth() + 1 - bm;
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1;
  }
  return age;
}

export type AgeEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "too_young" | "too_old"; age: number };

export interface AgeEligibilityOpts {
  birthDate: string;
  minAge: number | null;
  maxAge: number | null;
  onDate: Date;
}

/**
 * Check whether a person's age at a given date falls within eligibility bounds.
 *
 * Returns `{ eligible: true }` if:
 *   - Age equals minAge (if minAge is set)
 *   - Age is above minAge (if minAge is set)
 *   - Age equals maxAge (if maxAge is set)
 *   - Age is below maxAge (if maxAge is set)
 *   - Both minAge and maxAge are null
 *   - birthDate is empty or malformed (validation deferred to zod)
 *
 * Returns `{ eligible: false, reason: "too_young", age }` if age < minAge.
 * Returns `{ eligible: false, reason: "too_old", age }` if age > maxAge.
 *
 * Null minAge: no lower bound.
 * Null maxAge: no upper bound.
 *
 * @param opts Eligibility check parameters
 * @returns Eligibility decision and reason (if rejected)
 */
export function checkAgeEligibility(
  opts: AgeEligibilityOpts,
): AgeEligibilityResult {
  const { birthDate, minAge, maxAge, onDate } = opts;

  // Invalid birthDate: let zod own format validation; return eligible:true
  if (!birthDate || birthDate.trim() === "") {
    return { eligible: true };
  }

  // Try to parse the birthDate
  const parts = birthDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return { eligible: true };
  }

  const age = ageOnDate(birthDate, onDate);

  // Check minAge
  if (minAge !== null && age < minAge) {
    return { eligible: false, reason: "too_young", age };
  }

  // Check maxAge
  if (maxAge !== null && age > maxAge) {
    return { eligible: false, reason: "too_old", age };
  }

  return { eligible: true };
}
