import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { curriculumSequenceEntries, practiceTemplates } from "@/lib/db/schema";
import { eq, and, or, isNull, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

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
    if (postedIds.length > 0) {
      const validTemplates = await getDb()
        .select({ id: practiceTemplates.id })
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
