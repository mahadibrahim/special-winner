import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { practiceTemplates, developmentStages, teams } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, asc, desc } from "drizzle-orm";

// GET - Get practice templates filtered by sport and stage
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

    // Query parameters
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const defaultOnly = url.searchParams.get("defaultOnly") === "true";

    // Build conditions
    const conditions = [eq(practiceTemplates.active, true)];

    if (sportId) {
      conditions.push(eq(practiceTemplates.sportId, sportId));
    }

    if (stageId) {
      conditions.push(eq(practiceTemplates.stageId, stageId));
    }

    if (defaultOnly) {
      conditions.push(eq(practiceTemplates.isDefault, true));
    }

    // Get templates with sport and stage info
    const templates = await db
      .select({
        id: practiceTemplates.id,
        sportId: practiceTemplates.sportId,
        stageId: practiceTemplates.stageId,
        name: practiceTemplates.name,
        description: practiceTemplates.description,
        totalDurationMinutes: practiceTemplates.totalDurationMinutes,
        structure: practiceTemplates.structure,
        focusSkillIds: practiceTemplates.focusSkillIds,
        equipmentNeeded: practiceTemplates.equipmentNeeded,
        coachingNotes: practiceTemplates.coachingNotes,
        isDefault: practiceTemplates.isDefault,
        usageCount: practiceTemplates.usageCount,
        sport: {
          id: sports.id,
          name: sports.name,
        },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        },
      })
      .from(practiceTemplates)
      .innerJoin(sports, eq(practiceTemplates.sportId, sports.id))
      .innerJoin(developmentStages, eq(practiceTemplates.stageId, developmentStages.id))
      .where(and(...conditions))
      .orderBy(
        desc(practiceTemplates.isDefault),
        desc(practiceTemplates.usageCount),
        asc(practiceTemplates.name)
      );

    // Get all sports for filtering UI
    const sportsList = await db
      .select({
        id: sports.id,
        name: sports.name,
      })
      .from(sports);

    // Get all stages for filtering UI
    const stagesList = await db
      .select({
        id: developmentStages.id,
        name: developmentStages.name,
        slug: developmentStages.slug,
        ageMin: developmentStages.ageMin,
        ageMax: developmentStages.ageMax,
      })
      .from(developmentStages)
      .orderBy(developmentStages.sortOrder);

    return new Response(
      JSON.stringify({
        templates,
        sports: sportsList,
        stages: stagesList,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching templates:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
