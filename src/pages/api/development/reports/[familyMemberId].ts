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
import { eq, and, desc, sql } from "drizzle-orm";

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

    if (familyMember.parentUserId !== user.id) {
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
      level: a.level,
      notes: a.notes,
      coachName: `${a.coach.firstName} ${a.coach.lastName}`,
      assessedAt: a.assessedAt,
      context: a.observationContext,
    }));

    // Get assessment snapshots (Task 9) for the domain radar chart (Task 10).
    // A player can have snapshot rows across multiple seasons per domain —
    // take the most recently updated one per domain as "current".
    const snapshotRows = await getDb()
      .select({
        domainId: assessmentSnapshots.domainId,
        domainDisplayName: skillDomains.displayName,
        averageLevel: assessmentSnapshots.averageLevel,
        previousAverageLevel: assessmentSnapshots.previousAverageLevel,
        updatedAt: assessmentSnapshots.updatedAt,
      })
      .from(assessmentSnapshots)
      .innerJoin(skillDomains, eq(assessmentSnapshots.domainId, skillDomains.id))
      .where(eq(assessmentSnapshots.familyMemberId, familyMemberId))
      .orderBy(skillDomains.sortOrder, desc(assessmentSnapshots.updatedAt));

    const latestSnapshotByDomain = new Map<string, (typeof snapshotRows)[number]>();
    for (const row of snapshotRows) {
      if (!latestSnapshotByDomain.has(row.domainId)) {
        latestSnapshotByDomain.set(row.domainId, row);
      }
    }

    const snapshots = [...latestSnapshotByDomain.values()].map((row) => ({
      domain: row.domainDisplayName,
      averageLevel: row.averageLevel !== null ? parseFloat(row.averageLevel) : 0,
      previousAverageLevel:
        row.previousAverageLevel !== null ? parseFloat(row.previousAverageLevel) : null,
    }));

    // Calculate age
    const today = new Date();
    const birthDateValue = new Date(familyMember.birthDate);
    const age = Math.floor(
      (today.getTime() - birthDateValue.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

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
