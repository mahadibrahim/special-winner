import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { coachResources, coachResourceViews } from "@/lib/db/schema/coach-guidance";
import { sports } from "@/lib/db/schema/sports";
import { developmentStages, skills } from "@/lib/db/schema/curriculum";
import { eq, and, or, asc, desc, isNull, ilike, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

// GET - Get resources with filtering
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const skillId = url.searchParams.get("skillId");
    const topic = url.searchParams.get("topic");
    const resourceType = url.searchParams.get("type");
    const search = url.searchParams.get("search");
    const featured = url.searchParams.get("featured") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

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
    const resources = await db
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
    const topicsResult = await db
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
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const body = await context.request.json();
    const { resourceId, completed, rating, notes } = body;

    if (!resourceId) {
      return new Response(JSON.stringify({ error: "resourceId is required" }), { status: 400 });
    }

    // Record the view
    await db.insert(coachResourceViews).values({
      coachUserId: user.id,
      resourceId,
      completedAt: completed ? new Date() : null,
      rating,
      notes,
    });

    // Increment view count
    await db
      .update(coachResources)
      .set({
        viewCount: sql`${coachResources.viewCount} + 1`,
      })
      .where(eq(coachResources.id, resourceId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error recording resource view:", error);
    return new Response(JSON.stringify({ error: "Failed to record view" }), { status: 500 });
  }
};
