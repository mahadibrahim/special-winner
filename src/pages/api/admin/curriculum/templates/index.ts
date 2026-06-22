import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { practiceTemplates, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, asc, ilike, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const templateSegmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  durationMinutes: z.number().int().min(1),
  description: z.string().optional(),
  activitySuggestions: z.array(z.string()).optional(),
});

const templateSchema = z.object({
  sportId: z.string().uuid(),
  stageId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  totalDurationMinutes: z.number().int().min(1, "Duration must be at least 1 minute"),
  structure: z.array(templateSegmentSchema).optional(),
  focusSkillIds: z.array(z.string().uuid()).optional(),
  equipmentNeeded: z.array(z.string()).optional(),
  coachingNotes: z.string().optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

// GET - List templates with filtering
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const search = url.searchParams.get("search");
    const defaultOnly = url.searchParams.get("default") === "true";
    const activeOnly = url.searchParams.get("active") !== "false";
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions — restrict to caller's org or globally-owned (null) templates
    const conditions = [
      or(
        eq(practiceTemplates.organizationId, auth.organizationId),
        isNull(practiceTemplates.organizationId),
      )!,
    ];
    if (activeOnly) {
      conditions.push(eq(practiceTemplates.active, true));
    }
    if (sportId) {
      conditions.push(eq(practiceTemplates.sportId, sportId));
    }
    if (stageId) {
      conditions.push(eq(practiceTemplates.stageId, stageId));
    }
    if (defaultOnly) {
      conditions.push(eq(practiceTemplates.isDefault, true));
    }
    if (search) {
      conditions.push(
        or(
          ilike(practiceTemplates.name, `%${search}%`),
          ilike(practiceTemplates.description, `%${search}%`)
        )!
      );
    }

    const templatesList = await getDb()
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
        active: practiceTemplates.active,
        usageCount: practiceTemplates.usageCount,
        createdAt: practiceTemplates.createdAt,
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
      .orderBy(asc(practiceTemplates.name))
      .limit(limit)
      .offset(offset);

    // Get reference data — sports scoped to caller's org
    const [sportsList, stagesList] = await Promise.all([
      getDb()
        .select({ id: sports.id, name: sports.name })
        .from(sports)
        .where(eq(sports.organizationId, auth.organizationId))
        .orderBy(asc(sports.name)),
      getDb().select({ id: developmentStages.id, name: developmentStages.name, slug: developmentStages.slug }).from(developmentStages).orderBy(asc(developmentStages.sortOrder)),
    ]);

    return new Response(
      JSON.stringify({
        templates: templatesList,
        sports: sportsList,
        stages: stagesList,
        pagination: { limit, offset, total: templatesList.length },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching templates:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch templates" }), { status: 500 });
  }
};

// POST - Create new template
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const db = getDb();

    const body = await context.request.json();
    const result = templateSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the posted sportId belongs to the caller's org
    const sportCheck = await requireSameOrgSport(
      auth.organizationId,
      result.data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const [newTemplate] = await getDb()
      .insert(practiceTemplates)
      .values({ ...result.data, organizationId: auth.organizationId })
      .returning();

    return new Response(JSON.stringify({ template: newTemplate }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating template:", error);
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid sport or stage reference" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to create template" }), { status: 500 });
  }
};
