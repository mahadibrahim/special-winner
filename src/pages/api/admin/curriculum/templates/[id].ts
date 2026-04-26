import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { practiceTemplates, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

/**
 * Templates with organizationId === null are global; everyone with admin
 * access can read them but only super_admins should mutate them. We check
 * ownership against the caller's org and reject for cross-tenant ids.
 */
async function loadTemplateForOrg(
  orgId: string,
  templateId: string,
): Promise<{ id: string; organizationId: string | null } | null> {
  const [row] = await getDb()
    .select({
      id: practiceTemplates.id,
      organizationId: practiceTemplates.organizationId,
    })
    .from(practiceTemplates)
    .where(
      and(
        eq(practiceTemplates.id, templateId),
        or(
          eq(practiceTemplates.organizationId, orgId),
          isNull(practiceTemplates.organizationId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

const templateSegmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  durationMinutes: z.number().int().min(1),
  description: z.string().optional(),
  activitySuggestions: z.array(z.string()).optional(),
});

const updateTemplateSchema = z.object({
  sportId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  totalDurationMinutes: z.number().int().min(1).optional(),
  structure: z.array(templateSegmentSchema).optional().nullable(),
  focusSkillIds: z.array(z.string().uuid()).optional().nullable(),
  equipmentNeeded: z.array(z.string()).optional().nullable(),
  coachingNotes: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

// GET - Get single template with full details
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    const ownership = await loadTemplateForOrg(orgContext.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const [template] = await getDb()
      .select({
        id: practiceTemplates.id,
        organizationId: practiceTemplates.organizationId,
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
        active: practiceTemplates.active,
        usageCount: practiceTemplates.usageCount,
        createdAt: practiceTemplates.createdAt,
        updatedAt: practiceTemplates.updatedAt,
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
      .where(eq(practiceTemplates.id, id));

    if (!template) {
      return new Response(JSON.stringify({ error: "Template not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ template }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching template:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch template" }), { status: 500 });
  }
};

// PUT - Update template
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    // Verify the template belongs to caller's org (block cross-tenant writes
    // and reject mutations to global templates by non-super_admins).
    const ownership = await loadTemplateForOrg(orgContext.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global templates" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = updateTemplateSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // If sportId is being changed, verify the new sport belongs to caller's org.
    if (result.data.sportId) {
      const sportCheck = await requireSameOrgSport(
        orgContext.organizationId,
        result.data.sportId,
      );
      if (!sportCheck.ok) return ownershipDeniedResponse();
    }

    const [updatedTemplate] = await getDb()
      .update(practiceTemplates)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(practiceTemplates.id, id))
      .returning();

    if (!updatedTemplate) {
      return new Response(JSON.stringify({ error: "Template not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ template: updatedTemplate }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating template:", error);
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid sport or stage reference" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to update template" }), { status: 500 });
  }
};

// DELETE - Delete template
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    const ownership = await loadTemplateForOrg(orgContext.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot delete global templates" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const [deletedTemplate] = await getDb()
      .delete(practiceTemplates)
      .where(eq(practiceTemplates.id, id))
      .returning();

    if (!deletedTemplate) {
      return new Response(JSON.stringify({ error: "Template not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting template:", error);
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete template that is used in session plans" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete template" }), { status: 500 });
  }
};
