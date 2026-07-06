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

// ---------------------------------------------------------------------------
// Player × domain matrix and rollups (still pure — inputs are queried rows).
// ---------------------------------------------------------------------------

export interface CadencePlayer {
  familyMemberId: string;
  firstName: string;
  lastName: string;
}

export interface CadenceDomain {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
}

/** One row per (player, domain) that has at least one assessment: max(assessedAt). */
export interface LastAssessedRow {
  familyMemberId: string;
  domainId: string;
  lastAssessedAt: Date;
}

export interface DomainCadence {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
  thresholdDays: number | null;
  status: CadenceStatus;
  daysSinceLast: number | null;
}

export interface PlayerCadence {
  familyMemberId: string;
  firstName: string;
  lastName: string;
  /** Most severe status across all domains (see STATUS_RANK). */
  worstStatus: CadenceStatus;
  /** False only when the player has zero assessment rows in ANY domain. */
  hasAnyAssessment: boolean;
  domains: DomainCadence[];
}

/**
 * Severity order for rollups. "never" ranks above "overdue" — the loop never
 * started for that player/domain, the exact silent non-use Phase 4 surfaces.
 */
export const STATUS_RANK: Record<CadenceStatus, number> = {
  fresh: 0,
  due: 1,
  overdue: 2,
  never: 3,
};

export function worstStatus(statuses: CadenceStatus[]): CadenceStatus {
  let worst: CadenceStatus = "fresh";
  for (const status of statuses) {
    if (STATUS_RANK[status] > STATUS_RANK[worst]) worst = status;
  }
  return worst;
}

/**
 * Classify every player × domain pair. `lastAssessed` may contain rows for
 * players outside `players` (callers batch-query once per team set) — lookups
 * are keyed, extras are ignored.
 */
export function computeCadenceMatrix(
  players: CadencePlayer[],
  domains: CadenceDomain[],
  lastAssessed: LastAssessedRow[],
  now: Date,
): PlayerCadence[] {
  const lastByKey = new Map<string, Date>();
  for (const row of lastAssessed) {
    lastByKey.set(`${row.familyMemberId}:${row.domainId}`, row.lastAssessedAt);
  }

  return players.map((player) => {
    const domainStatuses: DomainCadence[] = domains.map((domain) => {
      const last =
        lastByKey.get(`${player.familyMemberId}:${domain.domainId}`) ?? null;
      return {
        domainId: domain.domainId,
        displayName: domain.displayName,
        assessmentFrequency: domain.assessmentFrequency,
        thresholdDays: cadenceThresholdDays(domain.assessmentFrequency),
        status: computeCadenceStatus(last, domain.assessmentFrequency, now),
        daysSinceLast: last ? daysBetween(last, now) : null,
      };
    });

    return {
      familyMemberId: player.familyMemberId,
      firstName: player.firstName,
      lastName: player.lastName,
      worstStatus: worstStatus(domainStatuses.map((d) => d.status)),
      hasAnyAssessment: domainStatuses.some((d) => d.daysSinceLast !== null),
      domains: domainStatuses,
    };
  });
}

// ---------------------------------------------------------------------------
// Level-distribution summary (admin report "distribution sanity" — display
// only, no verdicts).
// ---------------------------------------------------------------------------

export interface LevelDistribution {
  count: number;
  mean: number;
  /** Population standard deviation, rounded to 2dp. */
  stdDev: number;
}

export function summarizeLevelDistribution(
  levels: number[],
): LevelDistribution | null {
  if (levels.length === 0) return null;
  const mean = levels.reduce((sum, l) => sum + l, 0) / levels.length;
  const variance =
    levels.reduce((sum, l) => sum + (l - mean) ** 2, 0) / levels.length;
  return {
    count: levels.length,
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}
