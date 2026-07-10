import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  practiceTemplates,
  developmentStages,
  curriculumSequenceEntries,
  curriculumSequences,
  skills,
} from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import {
  evaluateGuardrails,
  resolveSuggestionSkillSlugs,
  resolveSkillInputsForSlugs,
} from "@/lib/curriculum/guardrails";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

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

/**
 * Re-check the BLOCK-tier age guardrail against every sequence that
 * references this template (via curriculum_sequence_entries), using the
 * STRICTEST (lowest-minAge) linked sequence's stage as the proxy season
 * band -- the same proxy convention the sequence-entry write path
 * (entries.ts) uses, since neither site knows the template's eventual
 * season at write time. A template with no linked sequences floats free
 * of this check; it's re-checked once it's actually attached to a
 * sequence entry.
 *
 * This closes the "template edit bypasses the block tier" gap (T2/T3
 * review finding #2): editing `focusSkillIds` or `structure` (whose
 * segments carry free-text `activitySuggestions` -- finding #3) on a
 * template already used in a sequence must be re-validated, not just
 * checked once at entry-write time.
 */
async function checkLinkedSequenceGuardrailBlocks(
  templateId: string,
  templateName: string,
  effectiveFocusSkillIds: string[] | null,
  effectiveStructure: { activitySuggestions?: string[] }[] | null,
) {
  const db = getDb();

  const linkedStages = await db
    .selectDistinct({
      stageId: developmentStages.id,
      ageMin: developmentStages.ageMin,
      ageMax: developmentStages.ageMax,
    })
    .from(curriculumSequenceEntries)
    .innerJoin(
      curriculumSequences,
      eq(curriculumSequenceEntries.sequenceId, curriculumSequences.id),
    )
    .innerJoin(
      developmentStages,
      eq(curriculumSequences.developmentStageId, developmentStages.id),
    )
    .where(eq(curriculumSequenceEntries.templateId, templateId));

  if (linkedStages.length === 0) return [];

  // Strictest = lowest minAge -- the band most likely to trip a safety
  // floor, so checking against it is the conservative choice across all
  // linked sequences.
  const strictest = linkedStages.reduce(
    (min, s) => (s.ageMin < min.ageMin ? s : min),
    linkedStages[0],
  );

  const skillIds = effectiveFocusSkillIds ?? [];
  const skillRows = skillIds.length
    ? await db
        .select({ id: skills.id, slug: skills.slug, name: skills.name })
        .from(skills)
        .where(inArray(skills.id, skillIds))
    : [];
  const focusSkills = skillRows.map((s) => ({
    slug: s.slug,
    name: s.name,
    introductionAge: null,
  }));

  const suggestionSlugs = resolveSuggestionSkillSlugs(
    (effectiveStructure ?? []).flatMap((seg) => seg.activitySuggestions ?? []),
  );
  const suggestionSkills = resolveSkillInputsForSlugs(suggestionSlugs);

  const seenSlugs = new Set(focusSkills.map((s) => s.slug));
  const mergedSkills = [
    ...focusSkills,
    ...suggestionSkills.filter((s) => !seenSlugs.has(s.slug)),
  ];

  const result = evaluateGuardrails({
    seasonMinAge: strictest.ageMin,
    seasonMaxAge: strictest.ageMax,
    activities: [{ name: templateName, appropriateStages: null, skills: mergedSkills }],
  });

  return result.blocks;
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    const ownership = await loadTemplateForOrg(auth.organizationId, id);
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    // Verify the template belongs to caller's org (block cross-tenant writes
    // and reject mutations to global templates by non-super_admins).
    const ownership = await loadTemplateForOrg(auth.organizationId, id);
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
        auth.organizationId,
        result.data.sportId,
      );
      if (!sportCheck.ok) return ownershipDeniedResponse();
    }

    // If this update touches focusSkillIds or structure (whose segments
    // carry free-text activitySuggestions), re-check the BLOCK-tier
    // guardrail against every sequence already using this template --
    // otherwise an edit here bypasses the checks entries.ts performed at
    // write time (T2/T3 review finding #2).
    const touchesGuardrailFields =
      "focusSkillIds" in result.data || "structure" in result.data;
    if (touchesGuardrailFields) {
      const [current] = await getDb()
        .select({
          name: practiceTemplates.name,
          focusSkillIds: practiceTemplates.focusSkillIds,
          structure: practiceTemplates.structure,
        })
        .from(practiceTemplates)
        .where(eq(practiceTemplates.id, id))
        .limit(1);

      const effectiveFocusSkillIds =
        "focusSkillIds" in result.data
          ? (result.data.focusSkillIds ?? null)
          : (current?.focusSkillIds ?? null);
      const effectiveStructure =
        "structure" in result.data
          ? (result.data.structure ?? null)
          : (current?.structure ?? null);
      const effectiveName = result.data.name ?? current?.name ?? "This template";

      const blocks = await checkLinkedSequenceGuardrailBlocks(
        id,
        effectiveName,
        effectiveFocusSkillIds,
        effectiveStructure,
      );
      if (blocks.length > 0) {
        return new Response(
          JSON.stringify({
            error:
              "This change would introduce a safety-blocked skill for a sequence already using this template",
            blocks,
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }
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
    if (getDbErrorCode(error) === "23503") {
      return new Response(JSON.stringify({ error: "Invalid sport or stage reference" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to update template" }), { status: 500 });
  }
};

// DELETE - Delete template
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Template ID required" }), { status: 400 });
    }

    const ownership = await loadTemplateForOrg(auth.organizationId, id);
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
    // Postgres raises 23001 (restrict_violation) for an explicit
    // `ON DELETE RESTRICT` FK — distinct from 23503 (foreign_key_violation,
    // the default NO ACTION code). curriculum_sequence_entries.template_id
    // declares RESTRICT, so 23001 is what actually fires here; 23503 is
    // checked too for defensiveness against other FK shapes.
    const code = getDbErrorCode(error);
    if (code === "23503" || code === "23001") {
      return new Response(
        JSON.stringify({
          error:
            "Cannot delete template: it is used by a curriculum sequence — remove it from the sequence first",
        }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete template" }), { status: 500 });
  }
};
