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
  seasons,
} from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { z } from "zod";

const createAssessmentSchema = z.object({
  familyMemberId: z.string().uuid(),
  skillId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  level: z.number().int().min(1).max(5),
  observationContext: z.enum(["practice", "game", "test", "scrimmage", "training"]).default("practice"),
  notes: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  areasForImprovement: z.array(z.string()).optional(),
});

// GET - Get assessments (optionally filtered by player, skill, team, etc.)
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Query parameters
    const familyMemberId = url.searchParams.get("familyMemberId");
    const skillId = url.searchParams.get("skillId");
    const teamId = url.searchParams.get("teamId");
    const domainId = url.searchParams.get("domainId");
    const limit = parseInt(url.searchParams.get("limit") || "50");

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

    // Build query conditions
    const conditions = [];

    if (familyMemberId) {
      conditions.push(eq(playerAssessments.familyMemberId, familyMemberId));
    }

    if (skillId) {
      conditions.push(eq(playerAssessments.skillId, skillId));
    }

    if (teamId) {
      conditions.push(eq(playerAssessments.teamId, teamId));
    }

    if (domainId) {
      conditions.push(eq(skills.domainId, domainId));
    }

    // Build query
    let query = db
      .select({
        id: playerAssessments.id,
        familyMemberId: playerAssessments.familyMemberId,
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
        createdAt: playerAssessments.createdAt,
        skill: {
          id: skills.id,
          name: skills.name,
          description: skills.description,
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
        player: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(developmentStages, eq(skills.stageId, developmentStages.id))
      .innerJoin(familyMembers, eq(playerAssessments.familyMemberId, familyMembers.id))
      .orderBy(desc(playerAssessments.assessedAt))
      .limit(limit);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const assessments = await query;

    return new Response(JSON.stringify({ assessments }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching assessments:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create a new assessment
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = createAssessmentSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const {
      familyMemberId,
      skillId,
      teamId,
      seasonId,
      level,
      observationContext,
      notes,
      strengths,
      areasForImprovement,
    } = validation.data;

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

    // Verify the player (family member) exists
    const [player] = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, familyMemberId));

    if (!player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the skill exists
    const [skill] = await db
      .select()
      .from(skills)
      .where(eq(skills.id, skillId));

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get previous assessment for this skill and player (if any)
    const [previousAssessment] = await db
      .select({ level: playerAssessments.level })
      .from(playerAssessments)
      .where(
        and(
          eq(playerAssessments.familyMemberId, familyMemberId),
          eq(playerAssessments.skillId, skillId)
        )
      )
      .orderBy(desc(playerAssessments.assessedAt))
      .limit(1);

    const previousLevel = previousAssessment?.level || null;

    // Create the assessment
    const [newAssessment] = await db
      .insert(playerAssessments)
      .values({
        familyMemberId,
        skillId,
        teamId: teamId || null,
        seasonId: seasonId || null,
        coachUserId: user.id,
        level,
        previousLevel,
        observationContext,
        notes: notes || null,
        strengths: strengths || null,
        areasForImprovement: areasForImprovement || null,
      })
      .returning();

    // Update or create player skill summary
    const [existingSummary] = await db
      .select()
      .from(playerSkillSummary)
      .where(
        and(
          eq(playerSkillSummary.familyMemberId, familyMemberId),
          eq(playerSkillSummary.skillId, skillId)
        )
      );

    if (existingSummary) {
      // Update existing summary
      const trend =
        level > existingSummary.currentLevel
          ? "improving"
          : level < existingSummary.currentLevel
          ? "declining"
          : "stable";

      await db
        .update(playerSkillSummary)
        .set({
          currentLevel: level,
          highestLevel: Math.max(level, existingSummary.highestLevel),
          assessmentCount: existingSummary.assessmentCount + 1,
          trend: trend as "improving" | "stable" | "declining",
          lastAssessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerSkillSummary.id, existingSummary.id));
    } else {
      // Create new summary
      await db.insert(playerSkillSummary).values({
        familyMemberId,
        skillId,
        currentLevel: level,
        highestLevel: level,
        assessmentCount: 1,
        trend: "new",
        firstAssessedAt: new Date(),
        lastAssessedAt: new Date(),
      });
    }

    return new Response(JSON.stringify({ assessment: newAssessment }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating assessment:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
