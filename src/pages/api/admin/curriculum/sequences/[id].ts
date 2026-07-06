import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  curriculumSequences,
  curriculumSequenceEntries,
  practiceTemplates,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const updateSequenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  programType: z.enum(["league", "class", "camp", "clinic"]).optional(),
  developmentStageId: z.string().uuid().optional(),
  // sportId deliberately immutable: entries are templates of this sport;
  // changing sport would silently invalidate every entry.
});

// GET - sequence + ordered entries (with template summary for the editor)
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const [sequence] = await getDb()
      .select()
      .from(curriculumSequences)
      .where(eq(curriculumSequences.id, id));

    const entries = await getDb()
      .select({
        id: curriculumSequenceEntries.id,
        position: curriculumSequenceEntries.position,
        templateId: curriculumSequenceEntries.templateId,
        objectives: curriculumSequenceEntries.objectives,
        notes: curriculumSequenceEntries.notes,
        template: {
          id: practiceTemplates.id,
          name: practiceTemplates.name,
          totalDurationMinutes: practiceTemplates.totalDurationMinutes,
        },
      })
      .from(curriculumSequenceEntries)
      .innerJoin(
        practiceTemplates,
        eq(curriculumSequenceEntries.templateId, practiceTemplates.id),
      )
      .where(eq(curriculumSequenceEntries.sequenceId, id))
      .orderBy(asc(curriculumSequenceEntries.position));

    return new Response(JSON.stringify({ sequence, entries }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sequence" }), {
      status: 500,
    });
  }
};

// PUT - update sequence metadata
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

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = updateSequenceSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const [updated] = await getDb()
      .update(curriculumSequences)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(curriculumSequences.id, id))
      .returning();

    return new Response(JSON.stringify({ sequence: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating sequence:", error);
    const code = getDbErrorCode(error);
    if (code === "23505") {
      return new Response(
        JSON.stringify({ error: "A sequence with this name already exists for this sport" }),
        { status: 409 },
      );
    }
    if (code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid stage reference" }), {
        status: 400,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to update sequence" }), {
      status: 500,
    });
  }
};

// DELETE - delete sequence. Entries cascade; seasons.curriculum_sequence_id
// nulls out via its ON DELETE SET NULL FK; already-generated draft
// session_plans have no FK to sequences and are intentionally untouched
// (they belong to the coach — spec acceptance criterion).
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Sequence ID required" }), {
        status: 400,
      });
    }

    const ownership = await loadSequenceForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot delete global sequences" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const [deleted] = await getDb()
      .delete(curriculumSequences)
      .where(eq(curriculumSequences.id, id))
      .returning();

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Sequence not found" }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to delete sequence" }), {
      status: 500,
    });
  }
};
