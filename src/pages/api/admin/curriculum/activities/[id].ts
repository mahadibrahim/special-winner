import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

/**
 * Activities with organizationId === null are global; everyone with admin
 * access can read them but only super_admins should mutate them. Cross-tenant
 * ids are rejected. Mirrors loadTemplateForOrg in templates/[id].ts.
 */
async function loadActivityForOrg(
  orgId: string,
  activityId: string,
): Promise<{ id: string; organizationId: string | null } | null> {
  const [row] = await getDb()
    .select({
      id: activities.id,
      organizationId: activities.organizationId,
    })
    .from(activities)
    .where(
      and(
        eq(activities.id, activityId),
        or(
          eq(activities.organizationId, orgId),
          isNull(activities.organizationId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

const updateActivitySchema = z.object({
  sportId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  activityType: z.enum(["warmup", "technical", "tactical", "game", "scrimmage", "conditioning", "cooldown", "fun"]).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  minPlayers: z.number().int().min(1).optional(),
  maxPlayers: z.number().int().optional().nullable(),
  durationMinutes: z.number().int().min(1).optional(),
  skillsDeveloped: z.array(z.string().uuid()).optional().nullable(),
  setupInstructions: z.string().optional().nullable(),
  howToPlay: z.string().optional(),
  coachingPoints: z.array(z.string()).optional().nullable(),
  questionsToAsk: z.array(z.string()).optional().nullable(),
  commonMistakes: z.array(z.string()).optional().nullable(),
  variations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    difficulty: z.string(),
  })).optional().nullable(),
  makeEasier: z.string().optional().nullable(),
  makeHarder: z.string().optional().nullable(),
  equipmentNeeded: z.array(z.string()).optional().nullable(),
  spaceRequired: z.string().optional().nullable(),
  indoorSuitable: z.boolean().optional(),
  appropriateStageIds: z.array(z.string().uuid()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});

// GET - Get single activity with full details
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Activity ID required" }), { status: 400 });
    }

    // Reject cross-tenant ids before the read.
    const ownership = await loadActivityForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const [activity] = await getDb()
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
        skillsDeveloped: activities.skillsDeveloped,
        setupInstructions: activities.setupInstructions,
        howToPlay: activities.howToPlay,
        coachingPoints: activities.coachingPoints,
        questionsToAsk: activities.questionsToAsk,
        commonMistakes: activities.commonMistakes,
        variations: activities.variations,
        makeEasier: activities.makeEasier,
        makeHarder: activities.makeHarder,
        equipmentNeeded: activities.equipmentNeeded,
        spaceRequired: activities.spaceRequired,
        indoorSuitable: activities.indoorSuitable,
        appropriateStageIds: activities.appropriateStageIds,
        tags: activities.tags,
        featured: activities.featured,
        active: activities.active,
        usageCount: activities.usageCount,
        averageRating: activities.averageRating,
        createdAt: activities.createdAt,
        updatedAt: activities.updatedAt,
        sport: {
          id: sports.id,
          name: sports.name,
        },
      })
      .from(activities)
      .innerJoin(sports, eq(activities.sportId, sports.id))
      .where(eq(activities.id, id));

    if (!activity) {
      return new Response(JSON.stringify({ error: "Activity not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ activity }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch activity" }), { status: 500 });
  }
};

// PUT - Update activity
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Activity ID required" }), { status: 400 });
    }

    // Cross-tenant + global-mutation guard.
    const ownership = await loadActivityForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot edit global activities" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await context.request.json();
    const result = updateActivitySchema.safeParse(body);

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

    const [updatedActivity] = await getDb()
      .update(activities)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, id))
      .returning();

    if (!updatedActivity) {
      return new Response(JSON.stringify({ error: "Activity not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ activity: updatedActivity }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating activity:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(JSON.stringify({ error: "An activity with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to update activity" }), { status: 500 });
  }
};

// DELETE - Delete activity
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const { id } = context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Activity ID required" }), { status: 400 });
    }

    // Cross-tenant + global-mutation guard.
    const ownership = await loadActivityForOrg(auth.organizationId, id);
    if (!ownership) return ownershipDeniedResponse();

    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (ownership.organizationId === null && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot delete global activities" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const [deletedActivity] = await getDb()
      .delete(activities)
      .where(eq(activities.id, id))
      .returning();

    if (!deletedActivity) {
      return new Response(JSON.stringify({ error: "Activity not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting activity:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete activity that is used in session plans" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete activity" }), { status: 500 });
  }
};
