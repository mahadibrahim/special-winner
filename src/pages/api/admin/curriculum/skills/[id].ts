import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { skills, skillDomains, assessmentRubrics } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/auth";

const updateSkillSchema = z.object({
  sportId: z.string().uuid().optional(),
  domainId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  introductionAge: z.number().int().min(3).max(18).optional().nullable(),
  assessmentMethod: z.enum(["observation", "test", "game", "self-report"]).optional(),
  progressionLevels: z.object({
    1: z.string(),
    2: z.string(),
    3: z.string(),
    4: z.string(),
    5: z.string(),
  }).optional().nullable(),
  coachingTips: z.array(z.string()).optional().nullable(),
  commonMistakes: z.array(z.string()).optional().nullable(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

// GET - Get single skill with full details
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    const [skill] = await db
      .select({
        id: skills.id,
        sportId: skills.sportId,
        domainId: skills.domainId,
        stageId: skills.stageId,
        name: skills.name,
        slug: skills.slug,
        description: skills.description,
        introductionAge: skills.introductionAge,
        assessmentMethod: skills.assessmentMethod,
        progressionLevels: skills.progressionLevels,
        coachingTips: skills.coachingTips,
        commonMistakes: skills.commonMistakes,
        sortOrder: skills.sortOrder,
        active: skills.active,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
        sport: {
          id: sports.id,
          name: sports.name,
        },
        domain: {
          id: skillDomains.id,
          name: skillDomains.displayName,
        },
      })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .where(eq(skills.id, id));

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), { status: 404 });
    }

    // Get assessment rubrics for this skill
    const rubrics = await db
      .select()
      .from(assessmentRubrics)
      .where(eq(assessmentRubrics.skillId, id))
      .orderBy(assessmentRubrics.level);

    return new Response(
      JSON.stringify({ skill, rubrics }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching skill:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch skill" }), { status: 500 });
  }
};

// PUT - Update skill
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    const body = await context.request.json();
    const result = updateSkillSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedSkill] = await db
      .update(skills)
      .set({
        ...result.data,
        updatedAt: new Date(),
      } as any)
      .where(eq(skills.id, id))
      .returning();

    if (!updatedSkill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ skill: updatedSkill }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating skill:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A skill with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to update skill" }), { status: 500 });
  }
};

// DELETE - Delete skill
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    // Delete associated rubrics first
    await db.delete(assessmentRubrics).where(eq(assessmentRubrics.skillId, id));

    // Delete the skill
    const [deletedSkill] = await db
      .delete(skills)
      .where(eq(skills.id, id))
      .returning();

    if (!deletedSkill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting skill:", error);
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete skill that has assessments associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete skill" }), { status: 500 });
  }
};
