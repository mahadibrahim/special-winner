import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  playerAssessments,
  skills,
  skillDomains,
  familyMembers,
  rosters,
  registrations,
  teams,
  seasons,
  programs,
  users,
} from "@/lib/db/schema";
import { assessmentSnapshots } from "@/lib/db/schema/assessments";
import { sports } from "@/lib/db/schema/sports";
import { canAccessFamilyMember } from "@/lib/auth/family-access";
import { quarterKeyFor, monthsOfQuarter } from "@/lib/curriculum/period-key";
import { eq, and, desc, sql } from "drizzle-orm";

const LEGACY_PERIOD_PREFIX = "legacy:";

/** `YYYY-MM` -> its `YYYY-Qn` quarter key, without needing a Date at hand. */
function quarterKeyOfMonth(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return quarterKeyFor(new Date(Date.UTC(year, month - 1, 1)));
}

/** The quarter key immediately preceding `quarterKey`, crossing year boundaries. */
function previousQuarterKey(quarterKey: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
  if (!match) throw new Error(`previousQuarterKey: invalid quarter key "${quarterKey}"`);
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  if (quarter === 1) return `${year - 1}-Q4`;
  return `${year}-Q${quarter - 1}`;
}

// GET - Get development report for a family member
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { familyMemberId } = params;
    if (!familyMemberId) {
      return new Response(JSON.stringify({ error: "Family member ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify the user has access to this family member
    const [familyMember] = await getDb()
      .select({
        id: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        birthDate: familyMembers.birthDate,
        parentUserId: familyMembers.parentUserId,
      })
      .from(familyMembers)
      .where(eq(familyMembers.id, familyMemberId));

    if (!familyMember) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hasAccess = await canAccessFamilyMember(db, user.id, familyMemberId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all skill domains
    const domains = await getDb()
      .select({
        id: skillDomains.id,
        name: skillDomains.name,
        displayName: skillDomains.displayName,
        description: skillDomains.description,
        sortOrder: skillDomains.sortOrder,
      })
      .from(skillDomains)
      .orderBy(skillDomains.sortOrder);

    // Get all assessments for this family member with skill and domain info
    const assessments = await getDb()
      .select({
        id: playerAssessments.id,
        level: playerAssessments.level,
        notes: playerAssessments.notes,
        strengths: playerAssessments.strengths,
        areasForImprovement: playerAssessments.areasForImprovement,
        assessedAt: playerAssessments.assessedAt,
        observationContext: playerAssessments.observationContext,
        skill: {
          id: skills.id,
          name: skills.name,
          description: skills.description,
        },
        domain: {
          id: skillDomains.id,
          name: skillDomains.name,
          displayName: skillDomains.displayName,
        },
        coach: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(users, eq(playerAssessments.coachUserId, users.id))
      .where(eq(playerAssessments.familyMemberId, familyMemberId))
      .orderBy(desc(playerAssessments.assessedAt));

    // Get current team enrollments
    const currentRosters = await getDb()
      .select({
        teamId: rosters.teamId,
        teamName: teams.name,
        position: rosters.position,
        sportId: sports.id,
        sportName: sports.name,
        seasonName: seasons.name,
        programName: programs.name,
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(teams, eq(rosters.teamId, teams.id))
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(
        and(
          eq(registrations.familyMemberId, familyMemberId),
          eq(rosters.status, "active")
        )
      );

    // Calculate domain summaries
    const domainSummaries = domains.map((domain) => {
      const domainAssessments = assessments.filter(
        (a) => a.domain.id === domain.id
      );

      // Get unique skills assessed in this domain
      const skillsMap = new Map<
        string,
        { skill: typeof domainAssessments[0]["skill"]; assessments: typeof domainAssessments }
      >();

      domainAssessments.forEach((a) => {
        const existing = skillsMap.get(a.skill.id);
        if (existing) {
          existing.assessments.push(a);
        } else {
          skillsMap.set(a.skill.id, {
            skill: a.skill,
            assessments: [a],
          });
        }
      });

      // Calculate skill progress for each skill
      const skillProgress = Array.from(skillsMap.values()).map(({ skill, assessments }) => {
        // Sort by date ascending for history
        const sorted = [...assessments].sort(
          (a, b) => new Date(a.assessedAt).getTime() - new Date(b.assessedAt).getTime()
        );

        const current = sorted[sorted.length - 1]?.level || 0;
        const previous = sorted.length > 1 ? sorted[sorted.length - 2]?.level || 0 : current;
        const history = sorted.map((a) => a.level);

        return {
          skillId: skill.id,
          skillName: skill.name,
          skillDescription: skill.description,
          currentLevel: current,
          previousLevel: previous,
          trend: current - previous,
          assessmentCount: assessments.length,
          history,
          lastAssessed: sorted[sorted.length - 1]?.assessedAt,
        };
      });

      // Calculate domain average
      const avgLevel =
        skillProgress.length > 0
          ? skillProgress.reduce((sum, s) => sum + s.currentLevel, 0) / skillProgress.length
          : 0;

      // Calculate previous average for trend
      const prevAvgLevel =
        skillProgress.length > 0
          ? skillProgress.reduce((sum, s) => sum + s.previousLevel, 0) / skillProgress.length
          : 0;

      return {
        domain: {
          id: domain.id,
          name: domain.name,
          slug: domain.name,
          displayName: domain.displayName,
          description: domain.description,
        },
        averageLevel: Math.round(avgLevel * 10) / 10,
        previousAverageLevel: Math.round(prevAvgLevel * 10) / 10,
        trend: Math.round((avgLevel - prevAvgLevel) * 10) / 10,
        skillCount: skillProgress.length,
        totalAssessments: domainAssessments.length,
        skills: skillProgress.sort((a, b) => b.currentLevel - a.currentLevel),
      };
    });

    // Calculate overall progress
    const overallAverage =
      domainSummaries.length > 0
        ? domainSummaries.reduce((sum, d) => sum + d.averageLevel, 0) / domainSummaries.length
        : 0;

    const previousOverallAverage =
      domainSummaries.length > 0
        ? domainSummaries.reduce((sum, d) => sum + d.previousAverageLevel, 0) / domainSummaries.length
        : 0;

    // Get recent assessments for timeline
    const recentAssessments = assessments.slice(0, 10).map((a) => ({
      id: a.id,
      skillName: a.skill.name,
      domainName: a.domain.name,
      domainDisplayName: a.domain.displayName,
      level: a.level,
      notes: a.notes,
      strengths: a.strengths ?? [],
      areasForImprovement: a.areasForImprovement ?? [],
      coachName: `${a.coach.firstName} ${a.coach.lastName}`,
      assessedAt: a.assessedAt,
      context: a.observationContext,
    }));

    // Get assessment snapshots (Task 9) for the domain radar chart (Task 10),
    // now period-aware (Phase 3 S4): the radar defaults to a current-quarter
    // rollup with monthly drill-down, falling back to the pre-S2
    // latest-per-domain-across-all-rows behavior for children who only have
    // legacy (`legacy:<seasonId>`) rows.
    const snapshotRows = await getDb()
      .select({
        domainId: assessmentSnapshots.domainId,
        domainDisplayName: skillDomains.displayName,
        averageLevel: assessmentSnapshots.averageLevel,
        previousAverageLevel: assessmentSnapshots.previousAverageLevel,
        periodKey: assessmentSnapshots.periodKey,
        updatedAt: assessmentSnapshots.updatedAt,
      })
      .from(assessmentSnapshots)
      .innerJoin(skillDomains, eq(assessmentSnapshots.domainId, skillDomains.id))
      .where(eq(assessmentSnapshots.familyMemberId, familyMemberId))
      .orderBy(skillDomains.sortOrder, desc(assessmentSnapshots.updatedAt));

    // Legacy fallback: most recently updated row per domain, across every
    // periodKey (legacy or monthly) — the pre-S4 behavior, kept per-domain
    // (keyed by domainId, not flattened to an array) so it can be merged
    // with the current-quarter rollup below rather than swapped in wholesale.
    const latestSnapshotByDomain = new Map<string, (typeof snapshotRows)[number]>();
    for (const row of snapshotRows) {
      if (!latestSnapshotByDomain.has(row.domainId)) {
        latestSnapshotByDomain.set(row.domainId, row);
      }
    }
    const legacyFallbackByDomainId = new Map(
      [...latestSnapshotByDomain.entries()].map(([domId, row]) => [
        domId,
        {
          domain: row.domainDisplayName,
          averageLevel: row.averageLevel !== null ? parseFloat(row.averageLevel) : 0,
          previousAverageLevel:
            row.previousAverageLevel !== null ? parseFloat(row.previousAverageLevel) : null,
        },
      ]),
    );

    // Monthly (non-legacy) rows only participate in period math.
    const monthlyRows = snapshotRows.filter(
      (row) => !row.periodKey.startsWith(LEGACY_PERIOD_PREFIX),
    );

    // periodKey -> domainId -> row (unique per the DB natural key).
    const rowsByPeriod = new Map<string, Map<string, (typeof snapshotRows)[number]>>();
    for (const row of monthlyRows) {
      let byDomain = rowsByPeriod.get(row.periodKey);
      if (!byDomain) {
        byDomain = new Map();
        rowsByPeriod.set(row.periodKey, byDomain);
      }
      byDomain.set(row.domainId, row);
    }

    // quarterKey -> periodKeys present in that quarter (chronological).
    const periodsByQuarter = new Map<string, string[]>();
    for (const periodKey of rowsByPeriod.keys()) {
      const quarterKey = quarterKeyOfMonth(periodKey);
      const list = periodsByQuarter.get(quarterKey) ?? [];
      list.push(periodKey);
      periodsByQuarter.set(quarterKey, list);
    }
    for (const list of periodsByQuarter.values()) list.sort();

    /** Average each domain's monthly rows within `quarterKey`, keyed by domainId. */
    function quarterDomainAverages(
      quarterKey: string,
    ): Map<string, { displayName: string; averageLevel: number }> {
      const periodKeys = periodsByQuarter.get(quarterKey) ?? [];
      const sums = new Map<string, { sum: number; count: number; displayName: string }>();
      for (const periodKey of periodKeys) {
        const byDomain = rowsByPeriod.get(periodKey)!;
        for (const [domId, row] of byDomain) {
          const level = row.averageLevel !== null ? parseFloat(row.averageLevel) : null;
          if (level === null) continue;
          const entry = sums.get(domId) ?? { sum: 0, count: 0, displayName: row.domainDisplayName };
          entry.sum += level;
          entry.count += 1;
          sums.set(domId, entry);
        }
      }
      const result = new Map<string, { displayName: string; averageLevel: number }>();
      for (const [domId, { sum, count, displayName }] of sums) {
        result.set(domId, { displayName, averageLevel: Math.round((sum / count) * 10) / 10 });
      }
      return result;
    }

    // Keeps `domainId` alongside the public `domain` display name — needed
    // internally for the per-domain merge below (`stripDomainId` removes it
    // before anything goes on the wire).
    function quarterEntrySnapshots(quarterKey: string) {
      const averages = quarterDomainAverages(quarterKey);
      if (averages.size === 0) return null;
      const previousAverages = quarterDomainAverages(previousQuarterKey(quarterKey));
      return [...averages.entries()].map(([domId, { displayName, averageLevel }]) => ({
        domainId: domId,
        domain: displayName,
        averageLevel,
        previousAverageLevel: previousAverages.get(domId)?.averageLevel ?? null,
      }));
    }

    function stripDomainId<T extends { domainId: string }>(
      snaps: T[],
    ): Omit<T, "domainId">[] {
      return snaps.map(({ domainId: _domainId, ...rest }) => rest);
    }

    const nowQuarterKey = quarterKeyFor(new Date());
    const currentMonths = monthsOfQuarter(nowQuarterKey);

    const radar: Array<{
      key: string;
      kind: "quarter" | "month";
      snapshots: { domain: string; averageLevel: number; previousAverageLevel: number | null }[];
    }> = [];

    const currentQuarterSnapshots = quarterEntrySnapshots(nowQuarterKey);
    if (currentQuarterSnapshots) {
      radar.push({
        key: nowQuarterKey,
        kind: "quarter",
        snapshots: stripDomainId(currentQuarterSnapshots),
      });
    }

    for (const periodKey of currentMonths) {
      const byDomain = rowsByPeriod.get(periodKey);
      if (!byDomain || byDomain.size === 0) continue;
      const monthSnapshots = [...byDomain.values()].map((row) => ({
        domain: row.domainDisplayName,
        averageLevel: row.averageLevel !== null ? parseFloat(row.averageLevel) : 0,
        previousAverageLevel:
          row.previousAverageLevel !== null ? parseFloat(row.previousAverageLevel) : null,
      }));
      radar.push({ key: periodKey, kind: "month", snapshots: monthSnapshots });
    }

    // Prior quarters with monthly data, most recent first, capped at 4.
    const priorQuarterKeys = [...periodsByQuarter.keys()]
      .filter((q) => q !== nowQuarterKey)
      .sort()
      .reverse()
      .slice(0, 4);
    for (const quarterKey of priorQuarterKeys) {
      const snaps = quarterEntrySnapshots(quarterKey);
      if (!snaps) continue;
      radar.push({ key: quarterKey, kind: "quarter", snapshots: stripDomainId(snaps) });
    }

    // Back-compat `snapshots` field: a PER-DOMAIN merge, not a whole-response
    // either/or. Every domain the member has ANY row for gets an entry —
    // the current-quarter rollup where that quarter has rows for the
    // domain, else the legacy/latest fallback for that domain. This matters
    // because migration 0147 backfilled EVERY existing family into legacy
    // rows, and real coaching won't touch every domain every quarter: a
    // child with legacy rows in 3 domains and current-quarter data in only
    // 1 must still see all 4 axes here, or DomainRadar's >=3-populated-axes
    // gate regresses a radar that rendered fine before this feature shipped
    // (an earlier either/or version of this line dropped the other 3
    // domains entirely — caught in review).
    const currentQuarterByDomainId = new Map(
      (currentQuarterSnapshots ?? []).map((s) => [
        s.domainId,
        { domain: s.domain, averageLevel: s.averageLevel, previousAverageLevel: s.previousAverageLevel },
      ]),
    );
    const snapshots = [...legacyFallbackByDomainId.entries()].map(
      ([domId, fallback]) => currentQuarterByDomainId.get(domId) ?? fallback,
    );

    // Calculate age. birthDate can be null for adult self-registrants whose
    // DOB is still pending post-payment review.
    let age: number | null = null;
    if (familyMember.birthDate) {
      const today = new Date();
      const birthDateValue = new Date(familyMember.birthDate);
      age = Math.floor(
        (today.getTime() - birthDateValue.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
    }

    return new Response(
      JSON.stringify({
        familyMember: {
          id: familyMember.id,
          firstName: familyMember.firstName,
          lastName: familyMember.lastName,
          age,
          birthDate: familyMember.birthDate,
        },
        currentEnrollments: currentRosters,
        overallProgress: {
          averageLevel: Math.round(overallAverage * 10) / 10,
          previousAverageLevel: Math.round(previousOverallAverage * 10) / 10,
          trend: Math.round((overallAverage - previousOverallAverage) * 10) / 10,
          totalAssessments: assessments.length,
          domainsAssessed: domainSummaries.filter((d) => d.skillCount > 0).length,
        },
        domainProgress: domainSummaries,
        recentAssessments,
        snapshots,
        periods: {
          current: { quarterKey: nowQuarterKey, months: currentMonths },
          radar,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching development report:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
