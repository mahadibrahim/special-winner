import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { coachingPrinciples } from "@/lib/db/schema/coach-guidance";
import { eq, and, or, asc, isNull } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

// GET - Get coaching principles
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

    // Build conditions
    const conditions = [eq(coachingPrinciples.active, true)];

    // Get principles that match:
    // 1. Global principles (no sport/stage specified)
    // 2. Sport-specific principles
    // 3. Stage-specific principles
    if (sportId) {
      conditions.push(or(isNull(coachingPrinciples.sportId), eq(coachingPrinciples.sportId, sportId))!);
    }

    if (stageId) {
      conditions.push(or(isNull(coachingPrinciples.stageId), eq(coachingPrinciples.stageId, stageId))!);
    }

    const principles = await db
      .select({
        id: coachingPrinciples.id,
        title: coachingPrinciples.title,
        principle: coachingPrinciples.principle,
        explanation: coachingPrinciples.explanation,
        doExamples: coachingPrinciples.doExamples,
        dontExamples: coachingPrinciples.dontExamples,
        europeanInsight: coachingPrinciples.europeanInsight,
        source: coachingPrinciples.source,
        sortOrder: coachingPrinciples.sortOrder,
      })
      .from(coachingPrinciples)
      .where(and(...conditions))
      .orderBy(asc(coachingPrinciples.sortOrder));

    return new Response(
      JSON.stringify({
        principles,
        total: principles.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching principles:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch principles" }), { status: 500 });
  }
};
