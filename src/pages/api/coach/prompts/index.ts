import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { coachPrompts, coachPromptDismissals, coachingPrinciples } from "@/lib/db/schema/coach-guidance";
import { sports } from "@/lib/db/schema/sports";
import { developmentStages, skills } from "@/lib/db/schema/curriculum";
import { eq, and, or, asc, desc, isNull, notInArray } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { clampLimit } from "@/lib/http/clamp-limit";

// GET - Get prompts by context
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const triggerContext = url.searchParams.get("context"); // pre_practice, during_practice, post_practice, etc.
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const limit = clampLimit(url.searchParams.get("limit"), 5, 25);
    const includeDismissed = url.searchParams.get("includeDismissed") === "true";

    // Build conditions
    const conditions = [eq(coachPrompts.active, true)];

    if (triggerContext) {
      conditions.push(eq(coachPrompts.triggerContext, triggerContext as any));
    }

    // Get prompts that match:
    // 1. Global prompts (no sport/stage specified)
    // 2. Sport-specific prompts
    // 3. Stage-specific prompts
    const sportConditions = sportId
      ? or(isNull(coachPrompts.sportId), eq(coachPrompts.sportId, sportId))
      : isNull(coachPrompts.sportId);

    const stageConditions = stageId
      ? or(isNull(coachPrompts.stageId), eq(coachPrompts.stageId, stageId))
      : isNull(coachPrompts.stageId);

    if (sportConditions) conditions.push(sportConditions);
    if (stageConditions) conditions.push(stageConditions);

    // Get dismissed prompt IDs for this coach (unless includeDismissed)
    let dismissedIds: string[] = [];
    if (!includeDismissed) {
      const dismissed = await getDb()
        .select({ promptId: coachPromptDismissals.promptId })
        .from(coachPromptDismissals)
        .where(eq(coachPromptDismissals.coachUserId, user.id));
      dismissedIds = dismissed.map((d) => d.promptId);
    }

    // Get prompts
    let query = getDb()
      .select({
        id: coachPrompts.id,
        triggerContext: coachPrompts.triggerContext,
        promptType: coachPrompts.promptType,
        title: coachPrompts.title,
        content: coachPrompts.content,
        priority: coachPrompts.priority,
        frequency: coachPrompts.frequency,
        isQuestionBased: coachPrompts.isQuestionBased,
        targetedBehavior: coachPrompts.targetedBehavior,
        tags: coachPrompts.tags,
        sportId: coachPrompts.sportId,
        stageId: coachPrompts.stageId,
      })
      .from(coachPrompts)
      .where(and(...conditions))
      .orderBy(desc(coachPrompts.priority), asc(coachPrompts.id))
      .limit(limit * 2); // Get extra to filter dismissed

    const prompts = await query;

    // Filter out dismissed and limit
    const filteredPrompts = prompts
      .filter((p) => !dismissedIds.includes(p.id))
      .slice(0, limit);

    return new Response(
      JSON.stringify({
        prompts: filteredPrompts,
        total: filteredPrompts.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch prompts" }), { status: 500 });
  }
};

// POST - Dismiss a prompt
export const POST: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = getDb();

    const body = await context.request.json();
    const { promptId, dismissType = "temporary" } = body;

    if (!promptId) {
      return new Response(JSON.stringify({ error: "promptId is required" }), { status: 400 });
    }

    // Record the dismissal
    await getDb().insert(coachPromptDismissals).values({
      coachUserId: user.id,
      promptId,
      dismissType,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error dismissing prompt:", error);
    return new Response(JSON.stringify({ error: "Failed to dismiss prompt" }), { status: 500 });
  }
};
