import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { venues, locations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const venueSchema = z.object({
  locationId: z.string().uuid("Valid location ID is required"),
  name: z.string().min(1, "Name is required"),
  address: z.string().optional().nullable(),
  fieldCount: z.number().min(1).default(1),
  indoor: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

// GET - List all venues
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allVenues = await getDb()
      .select({
        id: venues.id,
        locationId: venues.locationId,
        name: venues.name,
        address: venues.address,
        fieldCount: venues.fieldCount,
        indoor: venues.indoor,
        notes: venues.notes,
        active: venues.active,
        createdAt: venues.createdAt,
        location: {
          id: locations.id,
          name: locations.name,
        },
      })
      .from(venues)
      .innerJoin(locations, eq(venues.locationId, locations.id))
      .where(eq(locations.organizationId, orgContext.organizationId))
      .orderBy(asc(venues.name));

    return new Response(JSON.stringify({ venues: allVenues }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching venues:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch venues" }), { status: 500 });
  }
};

// POST - Create new venue
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = venueSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [newVenue] = await getDb()
      .insert(venues)
      .values({
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ venue: newVenue }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating venue:", error);
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid location selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to create venue" }), { status: 500 });
  }
};

// PUT - Update venue
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Venue ID is required" }), { status: 400 });
    }

    const result = venueSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedVenue] = await getDb()
      .update(venues)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, id))
      .returning();

    if (!updatedVenue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ venue: updatedVenue }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating venue:", error);
    if (error.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid location selected" }), { status: 400 });
    }
    return new Response(JSON.stringify({ error: "Failed to update venue" }), { status: 500 });
  }
};

// DELETE - Delete venue
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Venue ID is required" }), { status: 400 });
    }

    const [deletedVenue] = await getDb().delete(venues).where(eq(venues.id, id)).returning();

    if (!deletedVenue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting venue:", error);
    if (error.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete venue that has games scheduled" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete venue" }), { status: 500 });
  }
};
