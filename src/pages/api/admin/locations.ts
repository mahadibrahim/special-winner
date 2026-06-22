import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";

const externalStoreSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
  partnerName: z.enum(["Squadlocker", "BSN", "Custom Ink", "Other"]),
});

const locationSettingsPatchSchema = z
  .object({
    externalStore: externalStoreSchema.nullable().optional(),
  })
  .optional();

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
  settings: locationSettingsPatchSchema,
});

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const allLocations = await getDb()
      .select()
      .from(locations)
      .where(eq(locations.organizationId, auth.organizationId))
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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
    const [newLocation] = await getDb()
      .insert(locations)
      .values({
        organizationId: auth.organizationId,
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
    if (error.code === "23505" || error.cause?.code === "23505") {
      return new Response(JSON.stringify({ error: "A location with this slug already exists" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create location" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  // Org-scoped admin guard: requireOrgAdminAccess verifies the caller
  // administers THIS org, and the organizationId predicate below pins the
  // location to that org so an admin of another org can't edit it by posting its id.
  const auth = await requireOrgAdminAccess(context);
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

    const updates: Record<string, unknown> = {
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
    };

    if (validData.settings !== undefined) {
      const [existing] = await getDb()
        .select({ settings: locations.settings })
        .from(locations)
        .where(
          and(
            eq(locations.id, id),
            eq(locations.organizationId, auth.organizationId),
          ),
        );

      if (!existing) {
        return new Response(JSON.stringify({ error: "Location not found" }), { status: 404 });
      }

      const current = (existing.settings ?? {}) as Record<string, unknown>;
      const patch = validData.settings as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
          delete merged[key];
        } else if (value !== undefined) {
          merged[key] = value;
        }
      }
      updates.settings = merged;
    }

    const [updatedLocation] = await getDb()
      .update(locations)
      .set(updates as any)
      .where(
        and(
          eq(locations.id, id),
          eq(locations.organizationId, auth.organizationId),
        ),
      )
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
  // Org-scoped admin guard: requireOrgAdminAccess verifies the caller
  // administers THIS org, and the organizationId predicate below pins the
  // location to that org so an admin of another org can't delete it by id.
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Location ID is required" }), { status: 400 });
    }

    await getDb()
      .delete(locations)
      .where(
        and(
          eq(locations.id, id),
          eq(locations.organizationId, auth.organizationId),
        ),
      );
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting location:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete location that has programs associated with it" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete location" }), { status: 500 });
  }
};
