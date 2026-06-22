import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { ageGroups } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const ageGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  minAge: z.number().min(0, "Min age must be 0 or greater"),
  maxAge: z.number().min(1, "Max age must be at least 1"),
  birthDateCutoff: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

// GET - List all age groups
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const allAgeGroups = await getDb()
      .select()
      .from(ageGroups)
      .where(eq(ageGroups.organizationId, auth.organizationId))
      .orderBy(asc(ageGroups.minAge), asc(ageGroups.name));

    return new Response(JSON.stringify({ ageGroups: allAgeGroups }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching age groups:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch age groups" }), { status: 500 });
  }
};

// POST - Create new age group
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = ageGroupSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Validate min/max age relationship
    if (result.data.minAge >= result.data.maxAge) {
      return new Response(
        JSON.stringify({ error: "Max age must be greater than min age" }),
        { status: 400 }
      );
    }

    const [newAgeGroup] = await getDb()
      .insert(ageGroups)
      .values({
        organizationId: auth.organizationId,
        ...result.data,
        birthDateCutoff: result.data.birthDateCutoff || null,
      })
      .returning();

    return new Response(JSON.stringify({ ageGroup: newAgeGroup }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating age group:", error);
    return new Response(JSON.stringify({ error: "Failed to create age group" }), { status: 500 });
  }
};

// PUT - Update age group
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Age group ID is required" }), { status: 400 });
    }

    const result = ageGroupSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Validate min/max age relationship
    if (result.data.minAge >= result.data.maxAge) {
      return new Response(
        JSON.stringify({ error: "Max age must be greater than min age" }),
        { status: 400 }
      );
    }

    // Verify age group belongs to this organization
    const [updatedAgeGroup] = await getDb()
      .update(ageGroups)
      .set({
        ...result.data,
        birthDateCutoff: result.data.birthDateCutoff || null,
        updatedAt: new Date(),
      })
      .where(and(eq(ageGroups.id, id), eq(ageGroups.organizationId, auth.organizationId)))
      .returning();

    if (!updatedAgeGroup) {
      return new Response(JSON.stringify({ error: "Age group not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ ageGroup: updatedAgeGroup }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating age group:", error);
    return new Response(JSON.stringify({ error: "Failed to update age group" }), { status: 500 });
  }
};

// DELETE - Delete age group
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Age group ID is required" }), { status: 400 });
    }

    // Verify age group belongs to this organization before deleting
    const [deletedAgeGroup] = await getDb()
      .delete(ageGroups)
      .where(and(eq(ageGroups.id, id), eq(ageGroups.organizationId, auth.organizationId)))
      .returning();

    if (!deletedAgeGroup) {
      return new Response(JSON.stringify({ error: "Age group not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting age group:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete age group that has seasons associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete age group" }), { status: 500 });
  }
};
