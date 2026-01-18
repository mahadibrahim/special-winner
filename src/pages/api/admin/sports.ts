import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { sports, organizations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/auth";

const sportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  icon: z.string().optional(),
  color: z.string().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().default(0),
});

// GET - List all sports
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const allSports = await db
      .select()
      .from(sports)
      .orderBy(asc(sports.sortOrder), asc(sports.name));

    return new Response(JSON.stringify({ sports: allSports }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching sports:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch sports" }), { status: 500 });
  }
};

// POST - Create new sport
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = sportSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Get the default organization (first one)
    const org = await db.query.organizations.findFirst();
    if (!org) {
      return new Response(JSON.stringify({ error: "No organization found. Run db:seed first." }), { status: 400 });
    }

    const [newSport] = await db
      .insert(sports)
      .values({
        organizationId: org.id,
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ sport: newSport }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating sport:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A sport with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create sport" }), { status: 500 });
  }
};

// PUT - Update sport
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Sport ID is required" }), { status: 400 });
    }

    const result = sportSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedSport] = await db
      .update(sports)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(sports.id, id))
      .returning();

    if (!updatedSport) {
      return new Response(JSON.stringify({ error: "Sport not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ sport: updatedSport }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating sport:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A sport with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to update sport" }), { status: 500 });
  }
};

// DELETE - Delete sport
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Sport ID is required" }), { status: 400 });
    }

    const [deletedSport] = await db.delete(sports).where(eq(sports.id, id)).returning();

    if (!deletedSport) {
      return new Response(JSON.stringify({ error: "Sport not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting sport:", error);
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete sport that has programs associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete sport" }), { status: 500 });
  }
};
