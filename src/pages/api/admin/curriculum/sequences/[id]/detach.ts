import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSeason,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

const detachSchema = z.object({ seasonId: z.string().uuid() });

/**
 * POST - detach the sequence from a season. Already-generated draft
 * session_plans are intentionally left alone — they belong to the coach
 * (spec acceptance criterion: "sequence deletion/detachment leaves
 * already-generated drafts intact").
 */
export const POST: APIRoute = async (context) => {
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

    const body = await context.request.json();
    const result = detachSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const seasonCheck = await requireSameOrgSeason(
      auth.organizationId,
      result.data.seasonId,
    );
    if (!seasonCheck.ok) return ownershipDeniedResponse();

    // PK lookup — no orderBy needed on limit(1).
    const [season] = await getDb()
      .select({ curriculumSequenceId: seasons.curriculumSequenceId })
      .from(seasons)
      .where(eq(seasons.id, result.data.seasonId))
      .limit(1);

    if (season.curriculumSequenceId !== sequence.id) {
      return new Response(
        JSON.stringify({ error: "This sequence is not attached to that season" }),
        { status: 409 },
      );
    }

    await getDb()
      .update(seasons)
      .set({ curriculumSequenceId: null, updatedAt: new Date() })
      .where(eq(seasons.id, result.data.seasonId));

    return new Response(JSON.stringify({ detached: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error detaching sequence:", error);
    return new Response(JSON.stringify({ error: "Failed to detach sequence" }), {
      status: 500,
    });
  }
};
