import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activities, developmentStages, teams } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, or, arrayContains, ilike, desc, asc } from "drizzle-orm";

// GET - Get activities filtered by sport, stage, type, etc.
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify user is a coach
    const coachTeams = await getDb()
      .select({ id: teams.id })
      .from(teams)
      .where(
        or(
          eq(teams.coachUserId, user.id),
          eq(teams.assistantCoachUserId, user.id)
        )
      );

    if (coachTeams.length === 0) {
      return new Response(JSON.stringify({ error: "Access denied - not a coach" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Query parameters
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const activityType = url.searchParams.get("type");
    const difficulty = url.searchParams.get("difficulty");
    const search = url.searchParams.get("search");
    const featured = url.searchParams.get("featured");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sortBy = url.searchParams.get("sortBy") || "name"; // name, usageCount, averageRating

    // Build base query
    let query = getDb()
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
        usageCount: activities.usageCount,
        averageRating: activities.averageRating,
      })
      .from(activities);

    // Build conditions array
    const conditions = [eq(activities.active, true)];

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

    // Apply conditions
    query = query.where(and(...conditions)) as typeof query;

    // Apply sorting
    if (sortBy === "usageCount") {
      query = query.orderBy(desc(activities.usageCount)) as typeof query;
    } else if (sortBy === "averageRating") {
      query = query.orderBy(desc(activities.averageRating)) as typeof query;
    } else {
      query = query.orderBy(asc(activities.name)) as typeof query;
    }

    // Apply pagination
    query = query.limit(limit).offset(offset) as typeof query;

    const activityList = await query;

    // If stageId is provided, filter activities that are appropriate for that stage
    let filteredActivities = activityList;
    if (stageId) {
      filteredActivities = activityList.filter(
        (a) => a.appropriateStageIds?.includes(stageId)
      );
    }

    // Get sports for reference
    const sportsList = await getDb()
      .select({
        id: sports.id,
        name: sports.name,
      })
      .from(sports);

    // Get stages for reference
    const stagesList = await getDb()
      .select({
        id: developmentStages.id,
        name: developmentStages.name,
        slug: developmentStages.slug,
      })
      .from(developmentStages)
      .orderBy(developmentStages.sortOrder);

    return new Response(
      JSON.stringify({
        activities: filteredActivities,
        sports: sportsList,
        stages: stagesList,
        pagination: {
          total: filteredActivities.length,
          limit,
          offset,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching activities:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
