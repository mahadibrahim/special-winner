import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  playerAssessments,
  playerSkillSummary,
  skills,
  skillDomains,
  developmentStages,
  familyMembers,
  rosters,
  registrations,
  teams,
} from "@/lib/db/schema";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireCoachAccess, isPlayerOnCoachTeam, getCoachPlayerIds } from "@/lib/auth";
import { clampLimit } from "@/lib/http/clamp-limit";
import { recomputePlayerSnapshots } from "@/lib/curriculum/snapshots";

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

// GET - Get assessments (filtered to coach's players only)
export const GET: APIRoute = async (context) => {
  try {
    // Verify coach access
    const auth = await requireCoachAccess(context);
    if (!auth.authorized) return auth.response;

    const db = getDb();

    // Query parameters
    const familyMemberId = context.url.searchParams.get("familyMemberId");
    const skillId = context.url.searchParams.get("skillId");
    const teamId = context.url.searchParams.get("teamId");
    const domainId = context.url.searchParams.get("domainId");
    const limit = clampLimit(context.url.searchParams.get("limit"), 50);

    // If teamId is specified, verify coach owns that team
    if (teamId && !auth.teamIds.includes(teamId)) {
      return new Response(JSON.stringify({ error: "Access denied - not your team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // If familyMemberId is specified, verify player is on coach's team
    if (familyMemberId) {
      const hasAccess = await isPlayerOnCoachTeam(auth.teamIds, familyMemberId);
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Access denied - player not on your team" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get all player IDs the coach has access to
    const coachPlayerIds = await getCoachPlayerIds(auth.teamIds);

    if (coachPlayerIds.length === 0) {
      return new Response(JSON.stringify({ assessments: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build query conditions - always filter to coach's players
    const conditions = [inArray(playerAssessments.familyMemberId, coachPlayerIds)];

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
    const assessments = await getDb()
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
      .where(and(...conditions))
      .orderBy(desc(playerAssessments.assessedAt))
      .limit(limit);

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
export const POST: APIRoute = async (context) => {
  try {
    // Verify coach access
    const auth = await requireCoachAccess(context);
    if (!auth.authorized) return auth.response;

    const db = getDb();

    // Parse and validate request body
    const body = await context.request.json();
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

    // If teamId is provided, verify coach owns that team
    if (teamId && !auth.teamIds.includes(teamId)) {
      return new Response(JSON.stringify({ error: "Access denied - not your team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the player is on one of the coach's teams
    const hasAccess = await isPlayerOnCoachTeam(auth.teamIds, familyMemberId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied - player not on your team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // seasonId must be a season one of this coach's teams plays in — an
    // arbitrary (even cross-org) season id would otherwise be written bare.
    if (seasonId) {
      const [seasonTeam] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, auth.teamIds), eq(teams.seasonId, seasonId)))
        .orderBy(asc(teams.id))
        .limit(1);

      if (!seasonTeam) {
        return new Response(
          JSON.stringify({ error: "Invalid seasonId - not a season your teams play in" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Verify the player (family member) exists
    const [player] = await getDb()
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
    const [skill] = await getDb()
      .select()
      .from(skills)
      .where(eq(skills.id, skillId));

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Assessment insert + snapshot recompute + summary upsert are ONE unit.
    // If the snapshot recompute throws, everything rolls back and the coach
    // gets a 500 they can retry — a failed write beats a silently stale radar.
    const newAssessment = await db.transaction(async (tx) => {
      const [previousAssessment] = await tx
        .select({ level: playerAssessments.level })
        .from(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            eq(playerAssessments.skillId, skillId)
          )
        )
        .orderBy(desc(playerAssessments.assessedAt), desc(playerAssessments.id))
        .limit(1);

      const previousLevel = previousAssessment?.level ?? null;

      const [created] = await tx
        .insert(playerAssessments)
        .values({
          familyMemberId,
          skillId,
          teamId: teamId || null,
          seasonId: seasonId || null,
          coachUserId: auth.user.id,
          level,
          previousLevel,
          observationContext,
          notes: notes || null,
          strengths: strengths || null,
          areasForImprovement: areasForImprovement || null,
        })
        .returning();

      await recomputePlayerSnapshots(tx, familyMemberId, seasonId ?? null);

      const now = new Date();
      await tx
        .insert(playerSkillSummary)
        .values({
          familyMemberId,
          skillId,
          currentLevel: level,
          highestLevel: level,
          assessmentCount: 1,
          trend: "new",
          firstAssessedAt: now,
          lastAssessedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerSkillSummary.familyMemberId, playerSkillSummary.skillId],
          set: {
            currentLevel: level,
            highestLevel: sql`GREATEST(${playerSkillSummary.highestLevel}, ${level})`,
            assessmentCount: sql`${playerSkillSummary.assessmentCount} + 1`,
            trend: sql`CASE
              WHEN ${level} > ${playerSkillSummary.currentLevel} THEN 'improving'::trend_direction
              WHEN ${level} < ${playerSkillSummary.currentLevel} THEN 'declining'::trend_direction
              ELSE 'stable'::trend_direction
            END`,
            lastAssessedAt: now,
            updatedAt: now,
          },
        });

      return created;
    });

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
