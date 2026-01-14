import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  playerAssessments,
  skills,
  skillDomains,
  familyMembers,
  rosters,
} from "@/lib/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

// Achievement definitions based on assessment levels and counts
const ACHIEVEMENT_DEFINITIONS = [
  // Level-based achievements
  {
    id: "first-assessment",
    name: "First Steps",
    description: "Received your first coach assessment",
    category: "milestone",
    icon: "star",
    requirement: { type: "assessment_count", value: 1 },
  },
  {
    id: "five-assessments",
    name: "Growing Strong",
    description: "Received 5 coach assessments",
    category: "milestone",
    icon: "trending-up",
    requirement: { type: "assessment_count", value: 5 },
  },
  {
    id: "ten-assessments",
    name: "Dedicated Learner",
    description: "Received 10 coach assessments",
    category: "milestone",
    icon: "award",
    requirement: { type: "assessment_count", value: 10 },
  },
  {
    id: "twenty-five-assessments",
    name: "Consistent Performer",
    description: "Received 25 coach assessments",
    category: "milestone",
    icon: "medal",
    requirement: { type: "assessment_count", value: 25 },
  },

  // Skill level achievements
  {
    id: "developing-skill",
    name: "Skill Builder",
    description: "Reached Developing level (2) in any skill",
    category: "skill",
    icon: "target",
    requirement: { type: "skill_level", value: 2 },
  },
  {
    id: "competent-skill",
    name: "Getting Competent",
    description: "Reached Competent level (3) in any skill",
    category: "skill",
    icon: "zap",
    requirement: { type: "skill_level", value: 3 },
  },
  {
    id: "proficient-skill",
    name: "Proficiency Unlocked",
    description: "Reached Proficient level (4) in any skill",
    category: "skill",
    icon: "flame",
    requirement: { type: "skill_level", value: 4 },
  },
  {
    id: "advanced-skill",
    name: "Master in Training",
    description: "Reached Advanced level (5) in any skill",
    category: "skill",
    icon: "crown",
    requirement: { type: "skill_level", value: 5 },
  },

  // Domain achievements
  {
    id: "technical-explorer",
    name: "Technical Explorer",
    description: "Received assessments in 3+ technical skills",
    category: "domain",
    icon: "wrench",
    requirement: { type: "domain_skills", domain: "technical", value: 3 },
  },
  {
    id: "tactical-mind",
    name: "Tactical Mind",
    description: "Received assessments in 3+ tactical skills",
    category: "domain",
    icon: "lightbulb",
    requirement: { type: "domain_skills", domain: "tactical", value: 3 },
  },
  {
    id: "physical-powerhouse",
    name: "Physical Powerhouse",
    description: "Received assessments in 3+ physical skills",
    category: "domain",
    icon: "dumbbell",
    requirement: { type: "domain_skills", domain: "physical", value: 3 },
  },
  {
    id: "mental-champion",
    name: "Mental Champion",
    description: "Received assessments in 3+ psychological skills",
    category: "domain",
    icon: "brain",
    requirement: { type: "domain_skills", domain: "psychological", value: 3 },
  },

  // Improvement achievements
  {
    id: "first-improvement",
    name: "Level Up!",
    description: "Improved a skill level for the first time",
    category: "improvement",
    icon: "arrow-up",
    requirement: { type: "improvement_count", value: 1 },
  },
  {
    id: "five-improvements",
    name: "Rising Star",
    description: "Improved skill levels 5 times",
    category: "improvement",
    icon: "sparkles",
    requirement: { type: "improvement_count", value: 5 },
  },

  // Well-rounded achievements
  {
    id: "well-rounded",
    name: "Well-Rounded Athlete",
    description: "Received assessments in all 4 domains",
    category: "special",
    icon: "trophy",
    requirement: { type: "domains_assessed", value: 4 },
  },
];

// GET - Get achievements for a family member
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

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify access
    const [familyMember] = await db
      .select({ id: familyMembers.id, userId: familyMembers.userId })
      .from(familyMembers)
      .where(eq(familyMembers.id, familyMemberId));

    if (!familyMember || familyMember.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all assessments with domain info
    const assessments = await db
      .select({
        id: playerAssessments.id,
        skillId: playerAssessments.skillId,
        level: playerAssessments.level,
        assessedAt: playerAssessments.assessedAt,
        domainSlug: skillDomains.slug,
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .where(eq(playerAssessments.familyMemberId, familyMemberId))
      .orderBy(playerAssessments.assessedAt);

    // Calculate stats for achievement checking
    const totalAssessments = assessments.length;
    const maxLevel = assessments.length > 0 ? Math.max(...assessments.map((a) => a.level)) : 0;

    // Count unique skills per domain
    const domainSkills: Record<string, Set<string>> = {};
    const domainsAssessed = new Set<string>();
    assessments.forEach((a) => {
      domainsAssessed.add(a.domainSlug);
      if (!domainSkills[a.domainSlug]) {
        domainSkills[a.domainSlug] = new Set();
      }
      domainSkills[a.domainSlug].add(a.skillId);
    });

    // Count improvements (when a skill level increases)
    const skillHistory: Record<string, number[]> = {};
    assessments.forEach((a) => {
      if (!skillHistory[a.skillId]) {
        skillHistory[a.skillId] = [];
      }
      skillHistory[a.skillId].push(a.level);
    });

    let improvementCount = 0;
    Object.values(skillHistory).forEach((history) => {
      for (let i = 1; i < history.length; i++) {
        if (history[i] > history[i - 1]) {
          improvementCount++;
        }
      }
    });

    // Check each achievement
    const unlockedAchievements: {
      achievement: typeof ACHIEVEMENT_DEFINITIONS[0];
      unlockedAt: Date | null;
      progress: number;
      total: number;
    }[] = [];

    const lockedAchievements: {
      achievement: typeof ACHIEVEMENT_DEFINITIONS[0];
      progress: number;
      total: number;
    }[] = [];

    ACHIEVEMENT_DEFINITIONS.forEach((achievement) => {
      let isUnlocked = false;
      let progress = 0;
      let total = achievement.requirement.value;
      let unlockedAt: Date | null = null;

      switch (achievement.requirement.type) {
        case "assessment_count":
          progress = totalAssessments;
          isUnlocked = totalAssessments >= achievement.requirement.value;
          if (isUnlocked && assessments.length > 0) {
            // Find when this was unlocked
            unlockedAt = new Date(assessments[Math.min(achievement.requirement.value - 1, assessments.length - 1)].assessedAt);
          }
          break;

        case "skill_level":
          progress = maxLevel;
          isUnlocked = maxLevel >= achievement.requirement.value;
          if (isUnlocked) {
            const firstHighLevel = assessments.find((a) => a.level >= achievement.requirement.value);
            unlockedAt = firstHighLevel ? new Date(firstHighLevel.assessedAt) : null;
          }
          break;

        case "domain_skills":
          const domainKey = achievement.requirement.domain as string;
          progress = domainSkills[domainKey]?.size || 0;
          isUnlocked = progress >= achievement.requirement.value;
          break;

        case "improvement_count":
          progress = improvementCount;
          isUnlocked = improvementCount >= achievement.requirement.value;
          break;

        case "domains_assessed":
          progress = domainsAssessed.size;
          isUnlocked = domainsAssessed.size >= achievement.requirement.value;
          break;
      }

      if (isUnlocked) {
        unlockedAchievements.push({
          achievement,
          unlockedAt,
          progress,
          total,
        });
      } else {
        lockedAchievements.push({
          achievement,
          progress,
          total,
        });
      }
    });

    // Sort unlocked by most recent first
    unlockedAchievements.sort((a, b) => {
      if (!a.unlockedAt) return 1;
      if (!b.unlockedAt) return -1;
      return b.unlockedAt.getTime() - a.unlockedAt.getTime();
    });

    // Sort locked by closest to completion
    lockedAchievements.sort((a, b) => {
      const aProgress = a.progress / a.total;
      const bProgress = b.progress / b.total;
      return bProgress - aProgress;
    });

    return new Response(
      JSON.stringify({
        stats: {
          totalAssessments,
          maxLevel,
          domainsAssessed: domainsAssessed.size,
          improvementCount,
          achievementsUnlocked: unlockedAchievements.length,
          totalAchievements: ACHIEVEMENT_DEFINITIONS.length,
        },
        unlocked: unlockedAchievements,
        locked: lockedAchievements,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
