import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { ageGroups } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const allAgeGroups = await db
      .select()
      .from(ageGroups)
      .orderBy(asc(ageGroups.minAge));

    return new Response(JSON.stringify({ ageGroups: allAgeGroups }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching age groups:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch age groups" }), { status: 500 });
  }
};
