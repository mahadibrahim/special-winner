import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropSeasons, dropPlayers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const dropSeasonSchema = z.object({
  division: z.enum(["mens", "womens"]),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  locationId: z.string().uuid().optional().nullable(),
  sessionDay: z.number().int().min(0).max(6).optional().nullable(),
  maxPlayers: z.number().int().positive().optional().nullable(),
  status: z
    .enum(["draft", "open", "active", "completed", "cancelled"])
    .default("draft"),
});

/** Default session day per division: mens → 1 (Monday), womens → 3 (Wednesday). */
function defaultSessionDay(division: "mens" | "womens"): number {
  return division === "mens" ? 1 : 3;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allSeasons = await getDb()
      .select()
      .from(dropSeasons)
      .where(eq(dropSeasons.organizationId, orgContext.organizationId))
      .orderBy(dropSeasons.startDate);

    // Per-season player counts — standalone grouped query (no nesting; pool is max:1).
    const countRows = await getDb()
      .select({
        dropSeasonId: dropPlayers.dropSeasonId,
        count: sql<number>`count(*)::int`,
      })
      .from(dropPlayers)
      .where(eq(dropPlayers.organizationId, orgContext.organizationId))
      .groupBy(dropPlayers.dropSeasonId);

    const countMap = new Map(countRows.map((r) => [r.dropSeasonId, r.count]));

    const seasonsWithCount = allSeasons.map((s) => ({
      ...s,
      playerCount: countMap.get(s.id) ?? 0,
    }));

    return new Response(JSON.stringify({ seasons: seasonsWithCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching drop seasons:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch drop seasons" }),
      { status: 500 }
    );
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = dropSeasonSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const data = result.data;

    const sessionDay =
      data.sessionDay != null ? data.sessionDay : defaultSessionDay(data.division);

    const [newSeason] = await getDb()
      .insert(dropSeasons)
      .values({
        organizationId: orgContext.organizationId,
        locationId: data.locationId ?? null,
        division: data.division,
        name: data.name,
        slug: data.slug,
        startDate: data.startDate,
        endDate: data.endDate,
        sessionDay,
        maxPlayers: data.maxPlayers ?? null,
        status: data.status,
      })
      .returning();

    return new Response(JSON.stringify({ season: newSeason }), { status: 201 });
  } catch (error: any) {
    console.error("Error creating drop season:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({
          error: "A drop season with this slug already exists for this organization",
        }),
        { status: 409 }
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to create drop season" }),
      { status: 500 }
    );
  }
};
