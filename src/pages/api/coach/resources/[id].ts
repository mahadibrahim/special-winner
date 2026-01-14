import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { coachResources } from "@/lib/db/schema/coach-guidance";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

// GET - Get single resource with full content
export const GET: APIRoute = async ({ params, ...context }) => {
  const { user } = await validateSession(context as any);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), { status: 503 });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Resource ID required" }), { status: 400 });
    }

    const [resource] = await db
      .select()
      .from(coachResources)
      .where(eq(coachResources.id, id));

    if (!resource) {
      return new Response(JSON.stringify({ error: "Resource not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ resource }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching resource:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch resource" }), { status: 500 });
  }
};
