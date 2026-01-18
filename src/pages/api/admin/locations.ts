import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const locationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.organizationId, orgContext.organizationId))
      .orderBy(asc(locations.name));
    return new Response(JSON.stringify({ locations: allLocations }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch locations" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = locationSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const data = result.data;
    const [newLocation] = await db
      .insert(locations)
      .values({
        organizationId: orgContext.organizationId,
        name: data.name,
        slug: data.slug,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        state: data.state || null,
        postalCode: data.postalCode || null,
        phone: data.phone || null,
        email: data.email || null,
        active: data.active,
      })
      .returning();

    return new Response(JSON.stringify({ location: newLocation }), { status: 201 });
  } catch (error: any) {
    console.error("Error creating location:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A location with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create location" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Location ID is required" }), { status: 400 });
    }

    const result = locationSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const validData = result.data;
    const [updatedLocation] = await db
      .update(locations)
      .set({
        name: validData.name,
        slug: validData.slug,
        addressLine1: validData.addressLine1 || null,
        addressLine2: validData.addressLine2 || null,
        city: validData.city || null,
        state: validData.state || null,
        postalCode: validData.postalCode || null,
        phone: validData.phone || null,
        email: validData.email || null,
        active: validData.active,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, id))
      .returning();

    if (!updatedLocation) {
      return new Response(JSON.stringify({ error: "Location not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ location: updatedLocation }), { status: 200 });
  } catch (error: any) {
    console.error("Error updating location:", error);
    return new Response(JSON.stringify({ error: "Failed to update location" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Location ID is required" }), { status: 400 });
    }

    await db.delete(locations).where(eq(locations.id, id));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting location:", error);
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete location that has programs associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete location" }), { status: 500 });
  }
};
