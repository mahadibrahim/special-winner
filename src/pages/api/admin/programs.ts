import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { programs, sports, locations } from "@/lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgLocation,
  requireSameOrgSport,
  requireSameOrgProgram,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const programSchema = z.object({
  locationId: z.string().uuid("Invalid location"),
  sportId: z.string().uuid("Invalid sport"),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  programType: z.enum(["league", "camp", "clinic", "tournament", "training"]).default("league"),
  active: z.boolean().default(true),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Get organization context for multi-tenant filtering
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allPrograms = await getDb()
      .select({
        id: programs.id,
        name: programs.name,
        slug: programs.slug,
        description: programs.description,
        programType: programs.programType,
        active: programs.active,
        createdAt: programs.createdAt,
        location: {
          id: locations.id,
          name: locations.name,
          slug: locations.slug,
        },
        sport: {
          id: sports.id,
          name: sports.name,
          slug: sports.slug,
          icon: sports.icon,
          color: sports.color,
        },
      })
      .from(programs)
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(eq(locations.organizationId, orgContext.organizationId))
      .orderBy(asc(programs.name));

    return new Response(JSON.stringify({ programs: allPrograms }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch programs" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = programSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the posted location and sport belong to the caller's org
    const locationCheck = await requireSameOrgLocation(orgContext.organizationId, result.data.locationId);
    if (!locationCheck.ok) return ownershipDeniedResponse();
    const sportCheck = await requireSameOrgSport(orgContext.organizationId, result.data.sportId);
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const [newProgram] = await getDb()
      .insert(programs)
      .values({
        locationId: result.data.locationId,
        sportId: result.data.sportId,
        name: result.data.name,
        slug: result.data.slug,
        description: result.data.description || null,
        programType: result.data.programType,
        active: result.data.active,
      })
      .returning();

    return new Response(JSON.stringify({ program: newProgram }), { status: 201 });
  } catch (error: any) {
    console.error("Error creating program:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23505") {
      return new Response(JSON.stringify({ error: "A program with this slug already exists at this location" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create program" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Program ID is required" }), { status: 400 });
    }

    // Verify the existing program belongs to caller's org
    const existing = await requireSameOrgProgram(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const result = programSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify any changed location/sport ids also belong to caller's org
    const locationCheck = await requireSameOrgLocation(orgContext.organizationId, result.data.locationId);
    if (!locationCheck.ok) return ownershipDeniedResponse();
    const sportCheck = await requireSameOrgSport(orgContext.organizationId, result.data.sportId);
    if (!sportCheck.ok) return ownershipDeniedResponse();

    const [updatedProgram] = await getDb()
      .update(programs)
      .set({
        locationId: result.data.locationId,
        sportId: result.data.sportId,
        name: result.data.name,
        slug: result.data.slug,
        description: result.data.description || null,
        programType: result.data.programType,
        active: result.data.active,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, id))
      .returning();

    if (!updatedProgram) {
      return new Response(JSON.stringify({ error: "Program not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ program: updatedProgram }), { status: 200 });
  } catch (error: any) {
    console.error("Error updating program:", error);
    return new Response(JSON.stringify({ error: "Failed to update program" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Program ID is required" }), { status: 400 });
    }

    const existing = await requireSameOrgProgram(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    await getDb().delete(programs).where(eq(programs.id, id));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting program:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete program that has seasons associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete program" }), { status: 500 });
  }
};
