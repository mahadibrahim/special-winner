import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { curriculumSequences, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, isNull, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const sequenceSchema = z.object({
  sportId: z.string().uuid(),
  developmentStageId: z.string().uuid(),
  programType: z.enum(["league", "class", "camp", "clinic"]).default("league"),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
});

// GET - List sequences (caller's org + global), with reference lists
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");

    const conditions = [
      or(
        eq(curriculumSequences.organizationId, auth.organizationId),
        isNull(curriculumSequences.organizationId),
      )!,
    ];
    if (sportId) conditions.push(eq(curriculumSequences.sportId, sportId));

    const sequencesList = await getDb()
      .select({
        id: curriculumSequences.id,
        organizationId: curriculumSequences.organizationId,
        sportId: curriculumSequences.sportId,
        developmentStageId: curriculumSequences.developmentStageId,
        programType: curriculumSequences.programType,
        name: curriculumSequences.name,
        description: curriculumSequences.description,
        createdAt: curriculumSequences.createdAt,
        entryCount: sql<number>`(
          select count(*)::int from curriculum_sequence_entries e
          where e.sequence_id = ${curriculumSequences.id}
        )`,
        sport: { id: sports.id, name: sports.name },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        },
      })
      .from(curriculumSequences)
      .innerJoin(sports, eq(curriculumSequences.sportId, sports.id))
      .innerJoin(
        developmentStages,
        eq(curriculumSequences.developmentStageId, developmentStages.id),
      )
      .where(and(...conditions))
      .orderBy(asc(curriculumSequences.name));

    const [sportsList, stagesList] = await Promise.all([
      getDb()
        .select({ id: sports.id, name: sports.name })
        .from(sports)
        .where(eq(sports.organizationId, auth.organizationId))
        .orderBy(asc(sports.name)),
      getDb()
        .select({
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
        })
        .from(developmentStages)
        .orderBy(asc(developmentStages.sortOrder)),
    ]);

    return new Response(
      JSON.stringify({
        sequences: sequencesList,
        sports: sportsList,
        stages: stagesList,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching sequences:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sequences" }), {
      status: 500,
    });
  }
};

// POST - Create a sequence scoped to the caller's org
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = sequenceSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const sportCheck = await requireSameOrgSport(
      auth.organizationId,
      result.data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const [newSequence] = await getDb()
      .insert(curriculumSequences)
      .values({ ...result.data, organizationId: auth.organizationId })
      .returning();

    return new Response(JSON.stringify({ sequence: newSequence }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating sequence:", error);
    if (error.code === "23505") {
      return new Response(
        JSON.stringify({ error: "A sequence with this name already exists for this sport" }),
        { status: 409 },
      );
    }
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Invalid sport or stage reference" }),
        { status: 400 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to create sequence" }), {
      status: 500,
    });
  }
};
