/**
 * Assessment snapshot pipeline (Task 9 of the curriculum-recovery plan).
 *
 * A "snapshot" is a per (family_member, season, domain) rollup of the raw
 * `player_assessments` rows, recomputed whenever a coach records a new
 * assessment. It backs the domain radar chart on the parent/coach surfaces
 * (Task 10).
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { assessmentSnapshots, playerAssessments } from "@/lib/db/schema/assessments";
import { skills } from "@/lib/db/schema/curriculum";
import type { trendDirectionEnum } from "@/lib/db/schema/assessments";

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
 * Recompute and upsert `assessment_snapshots` rows for one player/season
 * across every domain that has at least one assessment.
 *
 * NOTE on trend naming: the plan brief describes trend semantics as
 * up/down/steady/new, but `trend_direction` (the pre-existing DB enum,
 * schema `src/lib/db/schema/assessments.ts`) is "improving" | "stable" |
 * "declining" | "new". We write the real enum values — up -> improving,
 * down -> declining, steady -> stable — rather than widen the enum.
 *
 * NOTE on seasonId: `assessment_snapshots.season_id` is NOT NULL, but
 * `player_assessments.season_id` is nullable (a coach can record an
 * assessment without picking a season). When `seasonId` is null there is
 * nowhere to write the snapshot, so this is a documented no-op — those
 * assessments simply don't contribute to the radar chart until the
 * assessment is backfilled with a season.
 */
export async function recomputePlayerSnapshots(
  db: Database,
  familyMemberId: string,
  seasonId: string | null,
): Promise<{ domainsWritten: number }> {
  if (seasonId === null) {
    return { domainsWritten: 0 };
  }

  return db.transaction(async (tx) => {
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
          eq(playerAssessments.seasonId, seasonId),
        ),
      )
      .orderBy(asc(playerAssessments.assessedAt), asc(playerAssessments.id));

    const averages = computeDomainAverages(rows);

    let domainsWritten = 0;
    for (const [domainId, { average, skillCount, assessmentCount }] of averages) {
      // Read the pre-update row inside the same transaction so
      // `previousAverageLevel` reflects the state before this write.
      const [existing] = await tx
        .select({ averageLevel: assessmentSnapshots.averageLevel })
        .from(assessmentSnapshots)
        .where(
          and(
            eq(assessmentSnapshots.familyMemberId, familyMemberId),
            eq(assessmentSnapshots.seasonId, seasonId),
            eq(assessmentSnapshots.domainId, domainId),
          ),
        );

      // Drizzle decimals round-trip as strings; parse for the trend math,
      // keep the string form for the write.
      const previousAverageLevel = existing?.averageLevel ?? null;
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
          seasonId,
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
            assessmentSnapshots.seasonId,
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
