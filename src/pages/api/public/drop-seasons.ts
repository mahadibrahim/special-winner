import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { dropSeasons } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * GET /api/public/drop-seasons
 *
 * Returns open drop league seasons for the resolved tenant. Used by the
 * registration flow and E2E tests to discover available seasons without
 * requiring authentication.
 *
 * Response is intentionally minimal — no player data, counts, weight, or BMI.
 */
export const GET: APIRoute = async ({ locals }) => {
  const organization = locals.organization;
  if (!organization) {
    return new Response(JSON.stringify({ seasons: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!db) throw new Error("No DB");

    const openSeasons = await db
      .select({
        id: dropSeasons.id,
        division: dropSeasons.division,
        name: dropSeasons.name,
        slug: dropSeasons.slug,
        startDate: dropSeasons.startDate,
        endDate: dropSeasons.endDate,
        sessionDay: dropSeasons.sessionDay,
      })
      .from(dropSeasons)
      .where(
        and(
          eq(dropSeasons.organizationId, organization.id),
          eq(dropSeasons.status, "open"),
        ),
      )
      .orderBy(asc(dropSeasons.startDate));

    return new Response(JSON.stringify({ seasons: openSeasons }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error fetching public drop seasons:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch drop seasons" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
