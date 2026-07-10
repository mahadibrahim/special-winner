import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { coachResources, coachResourceViews } from "@/lib/db/schema/coach-guidance";
import { sports } from "@/lib/db/schema/sports";
import { developmentStages, skills } from "@/lib/db/schema/curriculum";
import { eq, and, or, asc, desc, isNull, ilike, sql } from "drizzle-orm";
import { validateSession, requireCoachPortalAccess } from "@/lib/auth";
import { clampLimit } from "@/lib/http/clamp-limit";
import { z } from "zod";

const recordResourceViewSchema = z.object({
  resourceId: z.string().uuid(),
  completed: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

// GET - Get resources with filtering
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const skillId = url.searchParams.get("skillId");
    const topic = url.searchParams.get("topic");
    const resourceType = url.searchParams.get("type");
    const search = url.searchParams.get("search");
    const featured = url.searchParams.get("featured") === "true";
    const limit = clampLimit(url.searchParams.get("limit"), 20);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    // Build conditions
    const conditions = [eq(coachResources.active, true)];

    if (featured) {
      conditions.push(eq(coachResources.featured, true));
    }

    if (resourceType) {
      conditions.push(eq(coachResources.resourceType, resourceType as any));
    }

    if (topic) {
      conditions.push(eq(coachResources.topic, topic));
    }

    if (skillId) {
      conditions.push(eq(coachResources.skillId, skillId));
    }

    // Sport and stage filtering - include global resources
    if (sportId) {
      conditions.push(or(isNull(coachResources.sportId), eq(coachResources.sportId, sportId))!);
    }

    if (stageId) {
      conditions.push(or(isNull(coachResources.stageId), eq(coachResources.stageId, stageId))!);
    }

    if (search) {
      conditions.push(
        or(
          ilike(coachResources.title, `%${search}%`),
          ilike(coachResources.description, `%${search}%`)
        )!
      );
    }

    // Get resources
    const resources = await getDb()
      .select({
        id: coachResources.id,
        resourceType: coachResources.resourceType,
        title: coachResources.title,
        description: coachResources.description,
        url: coachResources.url,
        content: coachResources.content,
        thumbnailUrl: coachResources.thumbnailUrl,
        durationMinutes: coachResources.durationMinutes,
        topic: coachResources.topic,
        tags: coachResources.tags,
        source: coachResources.source,
        author: coachResources.author,
        viewCount: coachResources.viewCount,
        featured: coachResources.featured,
        sportId: coachResources.sportId,
        stageId: coachResources.stageId,
        skillId: coachResources.skillId,
      })
      .from(coachResources)
      .where(and(...conditions))
      .orderBy(desc(coachResources.featured), desc(coachResources.viewCount), asc(coachResources.title))
      .limit(limit)
      .offset(offset);

    // Get unique topics for filtering
    const topicsResult = await getDb()
      .selectDistinct({ topic: coachResources.topic })
      .from(coachResources)
      .where(eq(coachResources.active, true));

    const topics = topicsResult
      .map((t) => t.topic)
      .filter(Boolean) as string[];

    return new Response(
      JSON.stringify({
        resources,
        topics,
        total: resources.length,
        hasMore: resources.length === limit,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching resources:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch resources" }), { status: 500 });
  }
};

// POST - Record resource view
export const POST: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();

    const body = await context.request.json();
    const validation = recordResourceViewSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.error.flatten().fieldErrors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const { resourceId, completed, rating, notes } = validation.data;

    const [resource] = await db
      .select({ id: coachResources.id })
      .from(coachResources)
      .where(eq(coachResources.id, resourceId))
      .orderBy(asc(coachResources.id))
      .limit(1);

    if (!resource) {
      return new Response(JSON.stringify({ error: "Resource not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.transaction(async (tx) => {
      await tx.insert(coachResourceViews).values({
        coachUserId: auth.user.id,
        resourceId,
        completedAt: completed ? new Date() : null,
        rating: rating ?? null,
        notes: notes ?? null,
      });
      await tx
        .update(coachResources)
        .set({ viewCount: sql`${coachResources.viewCount} + 1` })
        .where(eq(coachResources.id, resourceId));
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error recording resource view:", error);
    return new Response(JSON.stringify({ error: "Failed to record view" }), { status: 500 });
  }
};
