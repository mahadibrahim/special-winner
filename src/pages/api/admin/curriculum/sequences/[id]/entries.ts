import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  curriculumSequenceEntries,
  practiceTemplates,
  developmentStages,
  skills,
} from "@/lib/db/schema";
import { eq, and, or, isNull, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";
import { evaluateGuardrails } from "@/lib/curriculum/guardrails";

const entriesSchema = z.object({
  entries: z
    .array(
      z.object({
        templateId: z.string().uuid(),
        objectives: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    )
    .max(52),
});

// PUT - replace the full ordered entry list. Positions are assigned from
// array order (1..N) — the move-up/move-down UI just reorders the array and
// re-PUTs, which keeps ordering transactional and gap-free.
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const sequence = await loadSequenceForOrg(auth.organizationId, id);
    if (!sequence) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (sequence.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = entriesSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    // Every posted template must be visible to this org (own or global)
    // AND belong to the sequence's sport.
    const postedIds = [...new Set(result.data.entries.map((e) => e.templateId))];
    let validTemplates: {
      id: string;
      name: string;
      focusSkillIds: string[] | null;
    }[] = [];
    if (postedIds.length > 0) {
      validTemplates = await getDb()
        .select({
          id: practiceTemplates.id,
          name: practiceTemplates.name,
          focusSkillIds: practiceTemplates.focusSkillIds,
        })
        .from(practiceTemplates)
        .where(
          and(
            inArray(practiceTemplates.id, postedIds),
            eq(practiceTemplates.sportId, sequence.sportId),
            or(
              eq(practiceTemplates.organizationId, auth.organizationId),
              isNull(practiceTemplates.organizationId),
            ),
          ),
        );
      const validIds = new Set(validTemplates.map((t) => t.id));
      const invalid = postedIds.filter((tid) => !validIds.has(tid));
      if (invalid.length > 0) {
        return new Response(
          JSON.stringify({
            error: "One or more templates were not found for this sequence's sport",
            details: { templateIds: invalid },
          }),
          { status: 400 },
        );
      }
    }

    // BLOCK-tier age guardrail (safety-rules.ts only; warn-tier stage skew
    // is evaluated by the blueprint UI/attach re-check, not here). The
    // season isn't known yet at entry-write time -- sequences attach to
    // seasons later -- so this uses the SEQUENCE's own stage as a proxy
    // band. Attach re-checks against the real season band (Task 4).
    if (validTemplates.length > 0) {
      const [stage] = await getDb()
        .select({ ageMin: developmentStages.ageMin, ageMax: developmentStages.ageMax })
        .from(developmentStages)
        .where(eq(developmentStages.id, sequence.developmentStageId))
        .limit(1);

      // No stage resolvable (shouldn't happen given the FK, but never crash
      // the write over it) -- skip; attach re-checks with the real season band.
      if (stage) {
        const skillIds = [
          ...new Set(validTemplates.flatMap((t) => t.focusSkillIds ?? [])),
        ];
        const skillRows = skillIds.length
          ? await getDb()
              .select({ id: skills.id, slug: skills.slug, name: skills.name })
              .from(skills)
              .where(inArray(skills.id, skillIds))
          : [];
        const skillsById = new Map(skillRows.map((s) => [s.id, s]));

        const guardrailResult = evaluateGuardrails({
          seasonMinAge: stage.ageMin,
          seasonMaxAge: stage.ageMax,
          activities: validTemplates.map((t) => ({
            name: t.name,
            // Templates carry no stage tagging of their own (that lives on
            // `activities` rows, which templates don't reference by FK --
            // only free-text `activitySuggestions`) -- warn tier doesn't
            // apply here, only the safety block below.
            appropriateStages: null,
            skills: (t.focusSkillIds ?? [])
              .map((sid) => skillsById.get(sid))
              .filter((s): s is { id: string; slug: string; name: string } => !!s)
              .map((s) => ({ slug: s.slug, name: s.name, introductionAge: null })),
          })),
        });

        if (guardrailResult.blocks.length > 0) {
          return new Response(
            JSON.stringify({
              error: "One or more templates contain safety-blocked skills for this sequence's stage",
              blocks: guardrailResult.blocks,
            }),
            { status: 422, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    const rows = result.data.entries.map((e, i) => ({
      sequenceId: id,
      position: i + 1,
      templateId: e.templateId,
      objectives: e.objectives ?? null,
      notes: e.notes ?? null,
    }));

    await getDb().transaction(async (tx) => {
      await tx
        .delete(curriculumSequenceEntries)
        .where(eq(curriculumSequenceEntries.sequenceId, id));
      if (rows.length > 0) {
        await tx.insert(curriculumSequenceEntries).values(rows);
      }
    });

    const entries = await getDb()
      .select()
      .from(curriculumSequenceEntries)
      .where(eq(curriculumSequenceEntries.sequenceId, id))
      .orderBy(asc(curriculumSequenceEntries.position));

    return new Response(JSON.stringify({ entries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error replacing sequence entries:", error);
    return new Response(JSON.stringify({ error: "Failed to update entries" }), {
      status: 500,
    });
  }
};
