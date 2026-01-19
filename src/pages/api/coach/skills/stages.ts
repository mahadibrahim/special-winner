import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { developmentStages } from "@/lib/db/schema";

// GET - Get all development stages
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const stages = await getDb()
      .select({
        id: developmentStages.id,
        name: developmentStages.name,
        slug: developmentStages.slug,
        ageMin: developmentStages.ageMin,
        ageMax: developmentStages.ageMax,
        description: developmentStages.description,
        philosophy: developmentStages.philosophy,
        practiceToGameRatio: developmentStages.practiceToGameRatio,
        maxHoursPerWeek: developmentStages.maxHoursPerWeek,
        keyPrinciples: developmentStages.keyPrinciples,
        coachRole: developmentStages.coachRole,
        sortOrder: developmentStages.sortOrder,
      })
      .from(developmentStages)
      .orderBy(developmentStages.sortOrder);

    return new Response(JSON.stringify({ stages }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching development stages:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
