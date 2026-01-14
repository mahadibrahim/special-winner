import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  playerAssessments,
  playerSkillSummary,
  skills,
  skillDomains,
  developmentStages,
  familyMembers,
  teams,
} from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";

// GET - Get all assessments for a specific player
export const GET: APIRoute = async ({ params, url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { playerId } = params;
    if (!playerId) {
      return new Response(JSON.stringify({ error: "Player ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify user is a coach
    const coachTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        or(
          eq(teams.coachUserId, user.id),
          eq(teams.assistantCoachUserId, user.id)
        )
      );

    if (coachTeams.length === 0) {
      return new Response(JSON.stringify({ error: "Access denied - not a coach" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get player info
    const [player] = await db
      .select({
        id: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        birthDate: familyMembers.birthDate,
        photoUrl: familyMembers.photoUrl,
      })
      .from(familyMembers)
      .where(eq(familyMembers.id, playerId));

    if (!player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Query parameters for filtering
    const domainId = url.searchParams.get("domainId");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    // Build conditions
    const conditions = [eq(playerAssessments.familyMemberId, playerId)];

    if (domainId) {
      conditions.push(eq(skills.domainId, domainId));
    }

    // Get assessments with skill details
    const assessments = await db
      .select({
        id: playerAssessments.id,
        skillId: playerAssessments.skillId,
        teamId: playerAssessments.teamId,
        seasonId: playerAssessments.seasonId,
        coachUserId: playerAssessments.coachUserId,
        level: playerAssessments.level,
        previousLevel: playerAssessments.previousLevel,
        observationContext: playerAssessments.observationContext,
        notes: playerAssessments.notes,
        strengths: playerAssessments.strengths,
        areasForImprovement: playerAssessments.areasForImprovement,
        assessedAt: playerAssessments.assessedAt,
        skill: {
          id: skills.id,
          name: skills.name,
          slug: skills.slug,
          description: skills.description,
          isCore: skills.isCore,
        },
        domain: {
          id: skillDomains.id,
          name: skillDomains.name,
          displayName: skillDomains.displayName,
          color: skillDomains.color,
          icon: skillDomains.icon,
        },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        },
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(developmentStages, eq(skills.stageId, developmentStages.id))
      .where(and(...conditions))
      .orderBy(desc(playerAssessments.assessedAt))
      .limit(limit);

    // Get skill summaries for the player (current state)
    const summaries = await db
      .select({
        id: playerSkillSummary.id,
        skillId: playerSkillSummary.skillId,
        currentLevel: playerSkillSummary.currentLevel,
        highestLevel: playerSkillSummary.highestLevel,
        assessmentCount: playerSkillSummary.assessmentCount,
        trend: playerSkillSummary.trend,
        firstAssessedAt: playerSkillSummary.firstAssessedAt,
        lastAssessedAt: playerSkillSummary.lastAssessedAt,
        skill: {
          id: skills.id,
          name: skills.name,
          slug: skills.slug,
          isCore: skills.isCore,
        },
        domain: {
          id: skillDomains.id,
          name: skillDomains.name,
          displayName: skillDomains.displayName,
          color: skillDomains.color,
        },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
        },
      })
      .from(playerSkillSummary)
      .innerJoin(skills, eq(playerSkillSummary.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(developmentStages, eq(skills.stageId, developmentStages.id))
      .where(eq(playerSkillSummary.familyMemberId, playerId))
      .orderBy(skillDomains.sortOrder, skills.sortOrder);

    // Calculate domain averages
    const domainAverages = summaries.reduce((acc, summary) => {
      const domainName = summary.domain.name;
      if (!acc[domainName]) {
        acc[domainName] = {
          domain: summary.domain,
          totalLevel: 0,
          count: 0,
          averageLevel: 0,
        };
      }
      acc[domainName].totalLevel += summary.currentLevel;
      acc[domainName].count += 1;
      acc[domainName].averageLevel = acc[domainName].totalLevel / acc[domainName].count;
      return acc;
    }, {} as Record<string, { domain: typeof summaries[0]["domain"]; totalLevel: number; count: number; averageLevel: number }>);

    return new Response(
      JSON.stringify({
        player,
        assessments,
        summaries,
        domainAverages: Object.values(domainAverages),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching player assessments:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
