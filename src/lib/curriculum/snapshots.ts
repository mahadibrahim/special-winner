/**
 * Assessment snapshot pipeline (Task 9 of the curriculum-recovery plan;
 * rewritten for monthly period bucketing in Phase 3 S2).
 *
 * A "snapshot" is a per (family_member, period, domain) rollup of the raw
 * `player_assessments` rows, recomputed whenever a coach records a new
 * assessment. It backs the domain radar chart on the parent/coach surfaces
 * (Task 10).
 *
 * Bucketing (S2): the period is the UTC calendar month of the triggering
 * assessment's `assessedAt` (see `period-key.ts` for the UTC rationale).
 * `seasonId` no longer bounds the aggregation query — a player's assessments
 * roll up by month regardless of which season (or no season, e.g. a
 * class-context assessment) they were recorded under. `seasonId` is written
 * as `null` on every row this function writes; it stays populated only on
 * pre-S2 `legacy:<seasonId>` rows (migration 0147's backfill).
 */
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { assessmentSnapshots, playerAssessments } from "@/lib/db/schema/assessments";
import { skills } from "@/lib/db/schema/curriculum";
import type { trendDirectionEnum } from "@/lib/db/schema/assessments";
import { periodKeyFor, previousPeriod } from "@/lib/curriculum/period-key";

export type TrendDirection = (typeof trendDirectionEnum.enumValues)[number];

export interface AssessmentRow {
  skillId: string;
  domainId: string;
  level: number;
  assessedAt: Date;
}

export interface DomainAverage {
  average: number;
  skillCount: number;
  assessmentCount: number;
}

/**
 * Pure aggregation: for each domain, take the latest assessment per skill
 * (max `assessedAt`) and average those levels across skills in the domain.
 * `assessmentCount` is the raw row count for the domain (all historical
 * assessments, not just the latest-per-skill ones used for the average).
 *
 * IMPORTANT: Input must be ordered oldest-first (by `assessedAt` ASC, then by
 * row ID ASC). On equal `assessedAt` timestamps, the row that sorts last by
 * (assessedAt, id) wins and replaces an earlier one with the same timestamp.
 * This tie-break is deterministic regardless of insertion order.
 */
export function computeDomainAverages(rows: AssessmentRow[]): Map<string, DomainAverage> {
  const byDomain = new Map<string, AssessmentRow[]>();
  for (const row of rows) {
    const list = byDomain.get(row.domainId);
    if (list) {
      list.push(row);
    } else {
      byDomain.set(row.domainId, [row]);
    }
  }

  const result = new Map<string, DomainAverage>();
  for (const [domainId, domainRows] of byDomain) {
    const latestBySkill = new Map<string, AssessmentRow>();
    for (const row of domainRows) {
      const existing = latestBySkill.get(row.skillId);
      if (!existing || row.assessedAt.getTime() >= existing.assessedAt.getTime()) {
        latestBySkill.set(row.skillId, row);
      }
    }

    const levels = [...latestBySkill.values()].map((r) => r.level);
    const sum = levels.reduce((s, l) => s + l, 0);
    const average = Math.round((sum / levels.length) * 100) / 100;

    result.set(domainId, {
      average,
      skillCount: levels.length,
      assessmentCount: domainRows.length,
    });
  }

  return result;
}

/**
 * Recompute and upsert `assessment_snapshots` rows for one player, bucketed
 * by the UTC calendar month of `at`, across every domain that has at least
 * one assessment in that month.
 *
 * `at` is the `assessedAt` of the assessment that triggered this recompute
 * (NOT `new Date()` / "now" — see the module docstring: snapshots derive
 * from `player_assessments.assessedAt`, never from wall-clock write time).
 * The aggregation window is `[monthStart, nextMonthStart)` in UTC, matching
 * `periodKeyFor(at)` exactly, so the rows this function reads are always
 * the same set implied by the period key it writes.
 *
 * There is no season filter and no season no-op: an assessment recorded
 * without a season (e.g. a class-context assessment) now buckets and
 * produces a snapshot exactly like one recorded under a season — the
 * per-row `seasonId` column is written as `null` in both cases going
 * forward (it only stays populated on legacy pre-S2 rows).
 *
 * NOTE on trend naming: the plan brief describes trend semantics as
 * up/down/steady/new, but `trend_direction` (the pre-existing DB enum,
 * schema `src/lib/db/schema/assessments.ts`) is "improving" | "stable" |
 * "declining" | "new". We write the real enum values — up -> improving,
 * down -> declining, steady -> stable — rather than widen the enum.
 *
 * NOTE on trend continuity: `previousAverageLevel`/`trend` compare against
 * the row for `previousPeriod(periodKeyFor(at))` for the same
 * (familyMemberId, domainId) — the chronologically preceding MONTH, not
 * whatever this same period's row held before this write. Two consequences
 * worth being explicit about:
 *   1. Recomputing the SAME month twice (e.g. two assessments landing in
 *      one calendar month) does not compare the second write against the
 *      first — both compare against the same prior-month baseline (or `new`
 *      if there isn't one). The month's average itself still reflects the
 *      latest data (full re-aggregation), only the trend arrow is stable
 *      across same-month recomputes.
 *   2. `previousPeriod` always returns a well-formed `YYYY-MM` key, which
 *      can never equal a `legacy:<seasonId>` key. So legacy rows are never
 *      looked up for trend purposes — a player whose most recent snapshot
 *      pre-dates S2 always starts its monthly trend chain at `new`, by
 *      construction, with no special-casing required.
 */
/**
 * Executor type: a plain Database or an open drizzle transaction. When a tx
 * is passed, the internal `transaction()` call below opens a SAVEPOINT, so
 * the caller's transaction still rolls everything back on error.
 */
export type SnapshotDb =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function recomputePlayerSnapshots(
  db: SnapshotDb,
  familyMemberId: string,
  at: Date,
): Promise<{ domainsWritten: number }> {
  const periodKey = periodKeyFor(at);
  const previousPeriodKey = previousPeriod(periodKey);

  const year = at.getUTCFullYear();
  const month = at.getUTCMonth(); // 0-indexed
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));

  return (db as Database).transaction(async (tx) => {
    const rows = await tx
      .select({
        skillId: playerAssessments.skillId,
        domainId: skills.domainId,
        level: playerAssessments.level,
        assessedAt: playerAssessments.assessedAt,
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .where(
        and(
          eq(playerAssessments.familyMemberId, familyMemberId),
          gte(playerAssessments.assessedAt, monthStart),
          lt(playerAssessments.assessedAt, nextMonthStart),
        ),
      )
      .orderBy(asc(playerAssessments.assessedAt), asc(playerAssessments.id));

    const averages = computeDomainAverages(rows);

    let domainsWritten = 0;
    for (const [domainId, { average, skillCount, assessmentCount }] of averages) {
      // Trend baseline = the previous MONTH's row for this member+domain,
      // never the pre-update state of the row being written (see the
      // function docstring's "trend continuity" note).
      const [previous] = await tx
        .select({ averageLevel: assessmentSnapshots.averageLevel })
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.periodKey, previousPeriodKey),
            eq(assessmentSnapshots.domainId, domainId),
          ),
        );

      // Drizzle decimals round-trip as strings; parse for the trend math,
      // keep the string form for the write.
      const previousAverageLevel = previous?.averageLevel ?? null;
      const previousNum =
        previousAverageLevel !== null ? parseFloat(previousAverageLevel) : null;

      let trend: TrendDirection;
      if (previousNum === null) {
        trend = "new";
      } else {
        const delta = average - previousNum;
        if (Math.abs(delta) < 0.25) {
          trend = "stable";
        } else if (delta > 0) {
          trend = "improving";
        } else {
          trend = "declining";
        }
      }

      const averageLevelStr = average.toFixed(2);

      await tx
        .insert(assessmentSnapshots)
        .values({
          familyMemberId,
          seasonId: null,
          periodKey,
          domainId,
          averageLevel: averageLevelStr,
          assessmentCount,
          skillsAssessed: skillCount,
          trend,
          previousAverageLevel,
        })
        .onConflictDoUpdate({
          target: [
            assessmentSnapshots.familyMemberId,
            assessmentSnapshots.periodKey,
            assessmentSnapshots.domainId,
          ],
          set: {
            averageLevel: averageLevelStr,
            assessmentCount,
            skillsAssessed: skillCount,
            trend,
            previousAverageLevel,
            snapshotDate: new Date(),
            updatedAt: new Date(),
          },
        });

      domainsWritten++;
    }

    return { domainsWritten };
  });
}
