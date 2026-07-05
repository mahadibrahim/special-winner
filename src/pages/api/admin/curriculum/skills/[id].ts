import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { skills, skillDomains, assessmentRubrics } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

/**
 * Skills with organizationId === null are global; everyone with admin
 * access can read them but only super_admins should mutate them. We
 * check ownership against the caller's org and reject for cross-tenant
 * ids. Mirrors loadTemplateForOrg in templates/[id].ts.
 */
async function loadSkillForOrg(
  orgId: string,
  skillId: string,
): Promise<{ id: string; organizationId: string | null } | null> {
  const [row] = await getDb()
    .select({
      id: skills.id,
      organizationId: skills.organizationId,
    })
    .from(skills)
    .where(
      and(
        eq(skills.id, skillId),
        or(eq(skills.organizationId, orgId), isNull(skills.organizationId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

const updateSkillSchema = z.object({
  sportId: z.string().uuid().optional(),
  domainId: z.string().uuid().optional(),
  // No .nullable(): skills.stage_id is NOT NULL, so an explicit null would
  // pass validation and then 500 on the update.
  stageId: z.string().uuid().optional(),
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    // Reject cross-tenant ids before the read (404-equivalent so we don't
    // leak existence of another org's skill).
    const ownership = await loadSkillForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const [skill] = await getDb()
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
    const rubrics = await getDb()
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    // Verify the skill belongs to caller's org (block cross-tenant writes
    // and reject mutations to global skills by non-super_admins).
    const ownership = await loadSkillForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global skills" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = updateSkillSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // If sportId is being changed, verify the new sport belongs to caller's org.
    if (result.data.sportId) {
      const sportCheck = await requireSameOrgSport(
        auth.organizationId,
        result.data.sportId,
      );
      if (!sportCheck.ok) return ownershipDeniedResponse();
    }

    const [updatedSkill] = await getDb()
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Skill ID required" }), { status: 400 });
    }

    // Same gate as PUT — cross-tenant + global-mutation guard.
    const ownership = await loadSkillForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot delete global skills" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Delete associated rubrics first
    await getDb().delete(assessmentRubrics).where(eq(assessmentRubrics.skillId, id));

    // Delete the skill
    const [deletedSkill] = await getDb()
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
