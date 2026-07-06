/**
 * Assessment cadence (Phase 4 of the coach-lifecycle program).
 *
 * Pure staleness classification: for a roster player × skill domain, how long
 * since the last `player_assessments` row vs the domain's
 * `assessmentFrequency` (`skill_domains.assessment_frequency`, seeded values
 * "weekly" | "monthly" | "per_season").
 *
 * Semantics (see the phase plan's Design Decisions):
 *   - never   — no assessment ever recorded for the player in the domain
 *   - fresh   — daysSince < threshold (or the domain has no cadence)
 *   - due     — threshold <= daysSince < 2 × threshold (AT the threshold = due)
 *   - overdue — daysSince >= 2 × threshold
 *
 * "per_season" maps to 90 days — a deliberate approximation; resolving the
 * actual season would make this impure and ambiguous for multi-team players.
 *
 * This module is pure by design (no DB imports) so it can be unit-tested
 * exhaustively; querying lives in ./assessment-cadence-query.ts.
 */

export type CadenceStatus = "fresh" | "due" | "overdue" | "never";

const MS_PER_DAY = 86_400_000;

/** Threshold in days for each known assessmentFrequency value. */
export const CADENCE_THRESHOLD_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  per_season: 90,
};

/** Null frequency (or an unrecognized value) means "no cadence configured". */
export function cadenceThresholdDays(
  assessmentFrequency: string | null,
): number | null {
  if (!assessmentFrequency) return null;
  return CADENCE_THRESHOLD_DAYS[assessmentFrequency] ?? null;
}

/** Whole days from `from` to `to`, floored (both UTC instants). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function computeCadenceStatus(
  lastAssessedAt: Date | null,
  assessmentFrequency: string | null,
  now: Date,
): CadenceStatus {
  if (lastAssessedAt === null) return "never";
  const threshold = cadenceThresholdDays(assessmentFrequency);
  if (threshold === null) return "fresh";
  const days = daysBetween(lastAssessedAt, now);
  if (days < threshold) return "fresh";
  if (days < threshold * 2) return "due";
  return "overdue";
}
