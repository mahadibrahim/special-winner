/**
 * Monthly subset + quarterly full development reports to parents (Phase 3
 * S6 — the repo's FIRST monthly cron).
 *
 * WHICH REPORT, WHEN (decision 4 in the plan): the cron runs on the 1st of
 * every month at 13:00 UTC (see netlify/functions/scheduled-development-reports.ts).
 * It always reports on the month that JUST CLOSED — but on the four months
 * that follow a closed QUARTER (cron runs Jan/Apr/Jul/Oct 1st, closing
 * Dec/Mar/Jun/Sep), it sends the quarterly FULL report for that quarter
 * INSTEAD of a monthly subset for the closing month alone. `computeReportPeriod`
 * is the pure decision function; see its docstring for the exact boundary.
 *
 * SCAN: a child qualifies for a report if they have >=1 `player_assessments`
 * row OR >=1 parent-visible `coach_notes` row dated within the period. No
 * SQL-level dedupe anti-join here (deliberate deviation from the
 * trial-convert.ts precedent) — see `scanCandidateFamilyMemberIds`'s
 * docstring for why: this feature sends to potentially MULTIPLE guardians
 * per child, and a single-column anti-join can't express "this specific
 * guardian hasn't been sent to yet" without becoming a correlated subquery
 * keyed on a guardian set we don't have until after the scan runs. Dedupe
 * is instead entirely the per-(child, guardian, period) pre-send check in
 * `sendDevReportMonthly`/`sendDevReportQuarterly` (src/lib/email/send.ts) —
 * the "PLUS the pre-send race re-check" half of the trial-convert pattern,
 * promoted here to the PRIMARY gate instead of a secondary race guard.
 *
 * GUARDIANS: mirrors src/pages/api/family/coach-notes.ts's guardian
 * resolution, inverted (child -> parents instead of parent -> children):
 * the primary guardian (`familyMembers.parentUserId`) UNION any additional
 * linked guardians (`family_member_parents.parentUserId`). A self-registered
 * adult (`familyMembers.selfUserId`) has no separate guardian to notify —
 * `selfUserId` rows never qualify here since nothing in the scan queries a
 * `self_user_id` anywhere near families of interest, and there's no
 * "development report for yourself" surface for a bare self row that has no
 * dependents. If `resolveGuardians` returns zero guardians (a data
 * anomaly — every family_members dependent row should have a parentUserId),
 * the candidate is counted as skipped rather than thrown.
 */
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachNotes,
  familyMembers,
  playerAchievements,
  playerAssessments,
  skillDomains,
  users,
} from "@/lib/db/schema";
import { assessmentSnapshots } from "@/lib/db/schema/assessments";
import { familyMemberParents } from "@/lib/db/schema/family-member-parents";
import {
  monthsOfQuarter,
  periodKeyFor,
  previousPeriod,
  quarterKeyFor,
} from "@/lib/curriculum/period-key";
import {
  sendDevReportMonthly,
  sendDevReportQuarterly,
  logDevReportSkippedNoGuardian,
  type DevReportMonthlyDomain,
  type DevReportQuarterlyDomain,
  type DevReportQuarterlyAchievement,
} from "@/lib/email/send";
import { captureServerException } from "@/lib/observability/server-error";
import { env } from "@/lib/env";
import { originForBrand } from "@/lib/organization/soccerone-routing";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthlyReportPeriod {
  kind: "monthly";
  /** `YYYY-MM` of the just-closed month — also the emailType suffix. */
  periodKey: string;
  /** Human label, e.g. "August 2026". */
  label: string;
  /** [start, end) UTC instant range covering the closed month. */
  start: Date;
  end: Date;
}

export interface QuarterlyReportPeriod {
  kind: "quarterly";
  /** `YYYY-Qn` of the just-closed quarter — also the emailType suffix. */
  quarterKey: string;
  /** The three `YYYY-MM` period keys making up the quarter, chronological. */
  months: string[];
  /** Human label, e.g. "Q3 2026". */
  label: string;
  /** [start, end) UTC instant range covering the closed quarter. */
  start: Date;
  end: Date;
}

export type ReportPeriod = MonthlyReportPeriod | QuarterlyReportPeriod;

function monthLabel(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Pure decision: given `now` (the cron's fire time), which report — and
 * covering which just-closed period — should go out?
 *
 * The closed month is always `previousPeriod(periodKeyFor(now))` — the
 * calendar month immediately before whichever month `now` falls in. When
 * that closed month is the LAST month of a quarter (Mar/Jun/Sep/Dec —
 * equivalently, when `now` falls in Jan/Apr/Jul/Oct), the quarterly FULL
 * report for that quarter fires instead of a monthly subset for just that
 * last month. Every other month fires the monthly subset for the closed
 * month alone.
 */
export function computeReportPeriod(now: Date): ReportPeriod {
  const currentMonthKey = periodKeyFor(now);
  const closedMonthKey = previousPeriod(currentMonthKey);
  const [closedYear, closedMonth] = closedMonthKey.split("-").map(Number);

  if (closedMonth % 3 === 0) {
    const closedMonthDate = new Date(Date.UTC(closedYear, closedMonth - 1, 1));
    const quarterKey = quarterKeyFor(closedMonthDate);
    const months = monthsOfQuarter(quarterKey);
    const [firstYear, firstMonth] = months[0].split("-").map(Number);
    const start = new Date(Date.UTC(firstYear, firstMonth - 1, 1));
    const end = new Date(Date.UTC(closedYear, closedMonth, 1));
    const quarterNum = Number(quarterKey.split("-Q")[1]);
    return {
      kind: "quarterly",
      quarterKey,
      months,
      label: `Q${quarterNum} ${closedYear}`,
      start,
      end,
    };
  }

  const start = new Date(Date.UTC(closedYear, closedMonth - 1, 1));
  const end = new Date(Date.UTC(closedYear, closedMonth, 1));
  return {
    kind: "monthly",
    periodKey: closedMonthKey,
    label: monthLabel(closedMonthKey),
    start,
    end,
  };
}

/** The `email_logs.email_type` this period's report is logged/deduped under. */
export function emailTypeForPeriod(period: ReportPeriod): string {
  return period.kind === "monthly" ? `dev_report_${period.periodKey}` : `dev_report_${period.quarterKey}`;
}

export interface DevReportCandidate {
  familyMemberId: string;
  childFirstName: string;
}

/**
 * Children with qualifying activity (>=1 assessment OR >=1 parent-visible
 * coach note) inside `period`'s date range. See the module docstring for
 * why this intentionally has no SQL-level dedupe anti-join.
 */
export async function scanCandidateFamilyMemberIds(
  period: ReportPeriod,
): Promise<DevReportCandidate[]> {
  const db = getDb();

  const fromAssessments = await db
    .selectDistinct({ id: familyMembers.id, firstName: familyMembers.firstName })
    .from(playerAssessments)
    .innerJoin(familyMembers, eq(playerAssessments.familyMemberId, familyMembers.id))
    .where(and(gte(playerAssessments.assessedAt, period.start), lt(playerAssessments.assessedAt, period.end)));

  const fromNotes = await db
    .selectDistinct({ id: familyMembers.id, firstName: familyMembers.firstName })
    .from(coachNotes)
    .innerJoin(familyMembers, eq(coachNotes.familyMemberId, familyMembers.id))
    .where(
      and(
        eq(coachNotes.visibleToParent, true),
        gte(coachNotes.createdAt, period.start),
        lt(coachNotes.createdAt, period.end),
      ),
    );

  const merged = new Map<string, string>();
  for (const row of [...fromAssessments, ...fromNotes]) {
    merged.set(row.id, row.firstName);
  }
  return [...merged.entries()].map(([familyMemberId, childFirstName]) => ({
    familyMemberId,
    childFirstName,
  }));
}

export interface GuardianInfo {
  parentUserId: string;
  email: string;
  firstName: string | null;
}

/**
 * Guardians for a child: the primary guardian (`familyMembers.parentUserId`)
 * plus any additional linked guardians (`family_member_parents`) — see the
 * module docstring. Deduplicated by user id (a user could theoretically be
 * both, though the app never creates that state).
 *
 * The linked-guardian query filters on `canReceiveMessages` — every other
 * outbound sender that reads `family_member_parents` respects this opt-out
 * flag (`team-group-sync.ts:61,236`, `broadcast.ts:315,330`), and a monthly
 * report is no exception. The PRIMARY guardian (`familyMembers.parentUserId`)
 * stays unconditional: there's no `canReceiveMessages` column on
 * `family_members` at all — the flag only exists on the join table for
 * additional linked guardians.
 */
export async function resolveGuardians(familyMemberId: string): Promise<GuardianInfo[]> {
  const db = getDb();

  const [member] = await db
    .select({ parentUserId: familyMembers.parentUserId })
    .from(familyMembers)
    .where(eq(familyMembers.id, familyMemberId));

  const linked = await db
    .select({ parentUserId: familyMemberParents.parentUserId })
    .from(familyMemberParents)
    .where(
      and(
        eq(familyMemberParents.familyMemberId, familyMemberId),
        eq(familyMemberParents.canReceiveMessages, true),
      ),
    );

  const parentUserIds = new Set<string>();
  if (member?.parentUserId) parentUserIds.add(member.parentUserId);
  for (const row of linked) parentUserIds.add(row.parentUserId);

  if (parentUserIds.size === 0) return [];

  const rows = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName })
    .from(users)
    .where(inArray(users.id, [...parentUserIds]));

  return rows.map((r) => ({ parentUserId: r.id, email: r.email, firstName: r.firstName }));
}

/** Monthly subset: per-domain level + trend for the closed month, plus glow count. */
async function buildMonthlyReportData(
  familyMemberId: string,
  period: MonthlyReportPeriod,
): Promise<{ domains: DevReportMonthlyDomain[]; glowCount: number }> {
  const db = getDb();

  const snapshotRows = await db
    .select({
      domainDisplayName: skillDomains.displayName,
      sortOrder: skillDomains.sortOrder,
      averageLevel: assessmentSnapshots.averageLevel,
      trend: assessmentSnapshots.trend,
    })
    .from(assessmentSnapshots)
    .innerJoin(skillDomains, eq(assessmentSnapshots.domainId, skillDomains.id))
    .where(
      and(eq(assessmentSnapshots.familyMemberId, familyMemberId), eq(assessmentSnapshots.periodKey, period.periodKey)),
    )
    .orderBy(asc(skillDomains.sortOrder));

  const domains: DevReportMonthlyDomain[] = snapshotRows.map((r) => ({
    domainName: r.domainDisplayName,
    averageLevel: r.averageLevel !== null ? parseFloat(r.averageLevel) : null,
    trend: r.trend,
  }));

  const glowRows = await db
    .select({ id: coachNotes.id })
    .from(coachNotes)
    .where(
      and(
        eq(coachNotes.familyMemberId, familyMemberId),
        eq(coachNotes.visibleToParent, true),
        gte(coachNotes.createdAt, period.start),
        lt(coachNotes.createdAt, period.end),
      ),
    );

  return { domains, glowCount: glowRows.length };
}

/** Quarterly full: quarter rollup per domain, assessment/skill counts, achievements. */
async function buildQuarterlyReportData(
  familyMemberId: string,
  period: QuarterlyReportPeriod,
): Promise<{
  domains: DevReportQuarterlyDomain[];
  assessmentCount: number;
  skillCount: number;
  achievements: DevReportQuarterlyAchievement[];
}> {
  const db = getDb();

  const snapshotRows = await db
    .select({
      domainId: assessmentSnapshots.domainId,
      domainDisplayName: skillDomains.displayName,
      sortOrder: skillDomains.sortOrder,
      averageLevel: assessmentSnapshots.averageLevel,
    })
    .from(assessmentSnapshots)
    .innerJoin(skillDomains, eq(assessmentSnapshots.domainId, skillDomains.id))
    .where(
      and(
        eq(assessmentSnapshots.familyMemberId, familyMemberId),
        inArray(assessmentSnapshots.periodKey, period.months),
      ),
    );

  const byDomain = new Map<
    string,
    { displayName: string; sortOrder: number; sum: number; count: number }
  >();
  for (const row of snapshotRows) {
    if (row.averageLevel === null) continue;
    const entry = byDomain.get(row.domainId) ?? {
      displayName: row.domainDisplayName,
      sortOrder: row.sortOrder,
      sum: 0,
      count: 0,
    };
    entry.sum += parseFloat(row.averageLevel);
    entry.count += 1;
    byDomain.set(row.domainId, entry);
  }

  const domains: DevReportQuarterlyDomain[] = [...byDomain.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => ({
      domainName: d.displayName,
      averageLevel: Math.round((d.sum / d.count) * 10) / 10,
    }));

  // Assessments/skills are the SOURCE OF TRUTH (Global Constraints) — counted
  // straight from player_assessments over the quarter's date range, not
  // derived from the (possibly stale-on-recompute) snapshot rows.
  const assessmentRows = await db
    .select({ skillId: playerAssessments.skillId })
    .from(playerAssessments)
    .where(
      and(
        eq(playerAssessments.familyMemberId, familyMemberId),
        gte(playerAssessments.assessedAt, period.start),
        lt(playerAssessments.assessedAt, period.end),
      ),
    );
  const assessmentCount = assessmentRows.length;
  const skillCount = new Set(assessmentRows.map((r) => r.skillId)).size;

  const achievementRows = await db
    .select({
      title: playerAchievements.title,
      description: playerAchievements.description,
      earnedAt: playerAchievements.earnedAt,
    })
    .from(playerAchievements)
    .where(
      and(
        eq(playerAchievements.familyMemberId, familyMemberId),
        gte(playerAchievements.earnedAt, period.start),
        lt(playerAchievements.earnedAt, period.end),
      ),
    )
    .orderBy(desc(playerAchievements.earnedAt));

  const achievements: DevReportQuarterlyAchievement[] = achievementRows.map((r) => ({
    title: r.title,
    description: r.description,
  }));

  return { domains, assessmentCount, skillCount, achievements };
}

function ctaUrlFor(familyMemberId: string): string {
  const appUrl = originForBrand("aspire") ?? env.PUBLIC_APP_URL;
  return `${appUrl}/dashboard/children/${familyMemberId}/development`;
}

export interface DevReportCounters {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface RunDevelopmentReportsResult extends DevReportCounters {
  candidates?: DevReportCandidate[];
}

/**
 * Scan + send development reports for every qualifying candidate in
 * `period`. Per-CHILD try/catch (a failure building one child's report data
 * doesn't stop the batch) with a nested per-GUARDIAN try/catch (one
 * guardian's send failure doesn't block a sibling guardian of the same
 * child). `dryRun` short-circuits after the scan and returns the candidate
 * list without resolving guardians, building report data, or sending
 * anything — cheap, and useful for ops to sanity-check the scan before a
 * live run.
 */
export async function runDevelopmentReports(
  period: ReportPeriod,
  opts?: { dryRun?: boolean },
): Promise<RunDevelopmentReportsResult> {
  const candidates = await scanCandidateFamilyMemberIds(period);

  if (opts?.dryRun) {
    return { scanned: candidates.length, sent: 0, skipped: 0, failed: 0, candidates };
  }

  const counters: DevReportCounters = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  /** Tally one guardian's send result into `counters`. Shared by both branches below. */
  function tally(result: { success: boolean; deduped?: boolean }) {
    if (result.success && !result.deduped) {
      counters.sent += 1;
    } else {
      counters.skipped += 1;
    }
  }

  for (const candidate of candidates) {
    counters.scanned += 1;
    try {
      const guardians = await resolveGuardians(candidate.familyMemberId);
      if (guardians.length === 0) {
        counters.skipped += 1;
        // Audit breadcrumb — see logDevReportSkippedNoGuardian's docstring
        // for why a zero-guardian candidate must still log SOMETHING
        // (every other terminal state in this cron does).
        await logDevReportSkippedNoGuardian({
          familyMemberId: candidate.familyMemberId,
          emailType: emailTypeForPeriod(period),
        });
        continue;
      }

      const ctaUrl = ctaUrlFor(candidate.familyMemberId);

      if (period.kind === "monthly") {
        const data = await buildMonthlyReportData(candidate.familyMemberId, period);
        for (const guardian of guardians) {
          try {
            const result = await sendDevReportMonthly({
              familyMemberId: candidate.familyMemberId,
              parentUserId: guardian.parentUserId,
              parentEmail: guardian.email,
              parentFirstName: guardian.firstName,
              childFirstName: candidate.childFirstName,
              periodKey: period.periodKey,
              periodLabel: period.label,
              domains: data.domains,
              glowCount: data.glowCount,
              ctaUrl,
            });
            tally(result);
          } catch (err) {
            console.error(
              `[reports] monthly development report send failed for child ${candidate.familyMemberId}, guardian ${guardian.parentUserId}:`,
              err,
            );
            void captureServerException(err, {
              component: "reports/development-reports",
              metadata: { familyMemberId: candidate.familyMemberId, parentUserId: guardian.parentUserId, phase: "send" },
            });
            counters.failed += 1;
          }
        }
      } else {
        const data = await buildQuarterlyReportData(candidate.familyMemberId, period);
        for (const guardian of guardians) {
          try {
            const result = await sendDevReportQuarterly({
              familyMemberId: candidate.familyMemberId,
              parentUserId: guardian.parentUserId,
              parentEmail: guardian.email,
              parentFirstName: guardian.firstName,
              childFirstName: candidate.childFirstName,
              quarterKey: period.quarterKey,
              quarterLabel: period.label,
              domains: data.domains,
              assessmentCount: data.assessmentCount,
              skillCount: data.skillCount,
              achievements: data.achievements,
              ctaUrl,
            });
            tally(result);
          } catch (err) {
            console.error(
              `[reports] quarterly development report send failed for child ${candidate.familyMemberId}, guardian ${guardian.parentUserId}:`,
              err,
            );
            void captureServerException(err, {
              component: "reports/development-reports",
              metadata: { familyMemberId: candidate.familyMemberId, parentUserId: guardian.parentUserId, phase: "send" },
            });
            counters.failed += 1;
          }
        }
      }
    } catch (err) {
      console.error(`[reports] development report failed for child ${candidate.familyMemberId}:`, err);
      void captureServerException(err, {
        component: "reports/development-reports",
        metadata: { familyMemberId: candidate.familyMemberId, phase: "build" },
      });
      counters.failed += 1;
    }
  }

  return counters;
}
