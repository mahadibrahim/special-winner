import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const scaffoldSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("clone"), sourceSeasonId: z.string().uuid() }),
  z.object({ type: z.literal("bulk"), count: z.number().int().min(0).max(50) }),
]);

const seasonSchema = z.object({
  programId: z.string().uuid("Invalid program"),
  ageGroupId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  registrationOpens: z.string().optional().nullable(),
  registrationCloses: z.string().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  priceCents: z.number().int().min(0, "Price must be positive"),
  depositCents: z.number().int().min(0).optional().nullable(),
  allowDeposit: z.boolean().default(true),
  status: z.enum(["draft", "open", "closed", "active", "completed", "cancelled"]).default("draft"),
  scheduleNotes: z.string().optional().nullable(),
  scaffold: scaffoldSchema.optional(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allSeasons = await getDb()
      .select({
        id: seasons.id,
        name: seasons.name,
        slug: seasons.slug,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
        registrationOpens: seasons.registrationOpens,
        registrationCloses: seasons.registrationCloses,
        maxParticipants: seasons.maxParticipants,
        priceCents: seasons.priceCents,
        depositCents: seasons.depositCents,
        allowDeposit: seasons.allowDeposit,
        status: seasons.status,
        scheduleNotes: seasons.scheduleNotes,
        createdAt: seasons.createdAt,
        program: {
          id: programs.id,
          name: programs.name,
          slug: programs.slug,
        },
        sport: {
          id: sports.id,
          name: sports.name,
          icon: sports.icon,
          color: sports.color,
        },
        location: {
          id: locations.id,
          name: locations.name,
        },
        ageGroup: {
          id: ageGroups.id,
          name: ageGroups.name,
          minAge: ageGroups.minAge,
          maxAge: ageGroups.maxAge,
        },
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(eq(locations.organizationId, orgContext.organizationId))
      .orderBy(asc(seasons.startDate));

    return new Response(JSON.stringify({ seasons: allSeasons }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching seasons:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch seasons" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = seasonSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const data = result.data;
    const [newSeason] = await getDb()
      .insert(seasons)
      .values({
        programId: data.programId,
        ageGroupId: data.ageGroupId || null,
        venueId: data.venueId || null,
        name: data.name,
        slug: data.slug,
        startDate: data.startDate,
        endDate: data.endDate,
        registrationOpens: data.registrationOpens ? new Date(data.registrationOpens) : null,
        registrationCloses: data.registrationCloses ? new Date(data.registrationCloses) : null,
        maxParticipants: data.maxParticipants || null,
        priceCents: data.priceCents,
        depositCents: data.depositCents || null,
        allowDeposit: data.allowDeposit,
        status: data.status,
        scheduleNotes: data.scheduleNotes || null,
      })
      .returning();

    return new Response(JSON.stringify({ season: newSeason }), { status: 201 });
  } catch (error: any) {
    console.error("Error creating season:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(JSON.stringify({ error: "A season with this slug already exists for this program" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create season" }), { status: 500 });
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    const result = seasonSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const validData = result.data;
    const [updatedSeason] = await getDb()
      .update(seasons)
      .set({
        programId: validData.programId,
        ageGroupId: validData.ageGroupId || null,
        venueId: validData.venueId || null,
        name: validData.name,
        slug: validData.slug,
        startDate: validData.startDate,
        endDate: validData.endDate,
        registrationOpens: validData.registrationOpens ? new Date(validData.registrationOpens) : null,
        registrationCloses: validData.registrationCloses ? new Date(validData.registrationCloses) : null,
        maxParticipants: validData.maxParticipants || null,
        priceCents: validData.priceCents,
        depositCents: validData.depositCents || null,
        allowDeposit: validData.allowDeposit,
        status: validData.status,
        scheduleNotes: validData.scheduleNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, id))
      .returning();

    if (!updatedSeason) {
      return new Response(JSON.stringify({ error: "Season not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ season: updatedSeason }), { status: 200 });
  } catch (error: any) {
    console.error("Error updating season:", error);
    return new Response(JSON.stringify({ error: "Failed to update season" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID is required" }), { status: 400 });
    }

    await getDb().delete(seasons).where(eq(seasons.id, id));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting season:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete season that has registrations" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete season" }), { status: 500 });
  }
};
