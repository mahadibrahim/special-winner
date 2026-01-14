import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { skillDomains } from "@/lib/db/schema";

// GET - Get all skill domains
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const domains = await db
      .select({
        id: skillDomains.id,
        name: skillDomains.name,
        displayName: skillDomains.displayName,
        description: skillDomains.description,
        color: skillDomains.color,
        icon: skillDomains.icon,
        assessmentFrequency: skillDomains.assessmentFrequency,
        sortOrder: skillDomains.sortOrder,
      })
      .from(skillDomains)
      .orderBy(skillDomains.sortOrder);

    return new Response(JSON.stringify({ domains }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching skill domains:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
