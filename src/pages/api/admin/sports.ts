import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { sports } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

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

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allSports = await getDb()
      .select()
      .from(sports)
      .where(eq(sports.organizationId, orgContext.organizationId))
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

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = sportSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [newSport] = await getDb()
      .insert(sports)
      .values({
        organizationId: orgContext.organizationId,
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ sport: newSport }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating sport:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(JSON.stringify({ error: "A sport with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create sport" }), { status: 500 });
  }
};

// PUT - Update sport
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Sport ID is required" }), { status: 400 });
    }

    // Verify the sport belongs to caller's org
    const existing = await requireSameOrgSport(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const result = sportSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedSport] = await getDb()
      .update(sports)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(
        and(eq(sports.id, id), eq(sports.organizationId, orgContext.organizationId)),
      )
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
    if (getDbErrorCode(error) === "23505") {
      return new Response(JSON.stringify({ error: "A sport with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to update sport" }), { status: 500 });
  }
};

// DELETE - Delete sport
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Sport ID is required" }), { status: 400 });
    }

    const existing = await requireSameOrgSport(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const [deletedSport] = await getDb()
      .delete(sports)
      .where(
        and(eq(sports.id, id), eq(sports.organizationId, orgContext.organizationId)),
      )
      .returning();

    if (!deletedSport) {
      return new Response(JSON.stringify({ error: "Sport not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting sport:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete sport that has programs associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete sport" }), { status: 500 });
  }
};
