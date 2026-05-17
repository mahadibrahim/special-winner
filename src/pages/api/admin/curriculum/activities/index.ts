import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activities, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, asc, desc, ilike, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const activitySchema = z.object({
  sportId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().optional(),
  activityType: z.enum(["warmup", "technical", "tactical", "game", "scrimmage", "conditioning", "cooldown", "fun"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  minPlayers: z.number().int().min(1).default(1),
  maxPlayers: z.number().int().optional(),
  durationMinutes: z.number().int().min(1).default(10),
  skillsDeveloped: z.array(z.string().uuid()).optional(),
  setupInstructions: z.string().optional(),
  howToPlay: z.string().min(1, "Instructions required"),
  coachingPoints: z.array(z.string()).optional(),
  questionsToAsk: z.array(z.string()).optional(),
  commonMistakes: z.array(z.string()).optional(),
  variations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    difficulty: z.string(),
  })).optional(),
  makeEasier: z.string().optional(),
  makeHarder: z.string().optional(),
  equipmentNeeded: z.array(z.string()).optional(),
  spaceRequired: z.string().optional(),
  indoorSuitable: z.boolean().default(true),
  appropriateStageIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

// GET - List activities with filtering
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");
    const activityType = url.searchParams.get("type");
    const difficulty = url.searchParams.get("difficulty");
    const search = url.searchParams.get("search");
    const featured = url.searchParams.get("featured");
    const activeOnly = url.searchParams.get("active") !== "false";
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Tenant scoping: caller sees their org's activities + global activities
    // (organizationId IS NULL means a platform-wide seed entry).
    const conditions: ReturnType<typeof and>[] = [
      or(
        eq(activities.organizationId, orgContext.organizationId),
        isNull(activities.organizationId),
      )!,
    ];
    if (activeOnly) {
      conditions.push(eq(activities.active, true));
    }
    if (sportId) {
      conditions.push(eq(activities.sportId, sportId));
    }
    if (activityType) {
      conditions.push(eq(activities.activityType, activityType as any));
    }
    if (difficulty) {
      conditions.push(eq(activities.difficulty, difficulty as any));
    }
    if (featured === "true") {
      conditions.push(eq(activities.featured, true));
    }
    if (search) {
      conditions.push(
        or(
          ilike(activities.name, `%${search}%`),
          ilike(activities.description, `%${search}%`)
        )!
      );
    }

    const activitiesList = await getDb()
      .select({
        id: activities.id,
        sportId: activities.sportId,
        name: activities.name,
        slug: activities.slug,
        description: activities.description,
        activityType: activities.activityType,
        difficulty: activities.difficulty,
        minPlayers: activities.minPlayers,
        maxPlayers: activities.maxPlayers,
        durationMinutes: activities.durationMinutes,
        equipmentNeeded: activities.equipmentNeeded,
        indoorSuitable: activities.indoorSuitable,
        tags: activities.tags,
        featured: activities.featured,
        active: activities.active,
        usageCount: activities.usageCount,
        averageRating: activities.averageRating,
        createdAt: activities.createdAt,
        sport: {
          id: sports.id,
          name: sports.name,
        },
      })
      .from(activities)
      .innerJoin(sports, eq(activities.sportId, sports.id))
      .where(and(...conditions))
      .orderBy(desc(activities.featured), asc(activities.name))
      .limit(limit)
      .offset(offset);

    // Get reference data — sports scoped to caller's org.
    const [sportsList, stagesList] = await Promise.all([
      getDb()
        .select({ id: sports.id, name: sports.name })
        .from(sports)
        .where(eq(sports.organizationId, orgContext.organizationId))
        .orderBy(asc(sports.name)),
      getDb().select({ id: developmentStages.id, name: developmentStages.name, slug: developmentStages.slug }).from(developmentStages).orderBy(asc(developmentStages.sortOrder)),
    ]);

    return new Response(
      JSON.stringify({
        activities: activitiesList,
        sports: sportsList,
        stages: stagesList,
        pagination: { limit, offset, total: activitiesList.length },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching activities:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch activities" }), { status: 500 });
  }
};

// POST - Create new activity
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const body = await context.request.json();
    const result = activitySchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the posted sportId belongs to the caller's org.
    const sportCheck = await requireSameOrgSport(
      orgContext.organizationId,
      result.data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    // New activities are always created in the caller's org. Seed globals
    // (organizationId = null) via migration/seed scripts, not this route.
    const [newActivity] = await getDb()
      .insert(activities)
      .values({ ...result.data, organizationId: orgContext.organizationId } as any)
      .returning();

    return new Response(JSON.stringify({ activity: newActivity }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating activity:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "An activity with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create activity" }), { status: 500 });
  }
};
