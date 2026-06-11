import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, registrations, organizations } from "@/lib/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

export const GET: APIRoute = async ({ url, locals }) => {
  const organization = locals.organization;
  if (!organization) {
    return new Response(JSON.stringify({ seasons: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const locationSlug = url.searchParams.get("location");
  const sportSlug = url.searchParams.get("sport");
  const status = url.searchParams.get("status");
  const audience = url.searchParams.get("audience"); // "youth" | "adult" | null

  try {
    if (!db) throw new Error("No DB");

    // Build query conditions
    const conditions = [];
    // Tenant scope — must be first.
    conditions.push(eq(organizations.id, organization.id));
    if (status) {
      conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
    }
    if (locationSlug && locationSlug !== "all") {
      conditions.push(eq(locations.slug, locationSlug));
    }
    if (sportSlug) {
      conditions.push(eq(sports.slug, sportSlug));
    }
    // Audience filter: apply age-group bounds when audience is specified.
    // For seasons without an age group we include them in both views (no
    // ageGroupId means the season is open to all).
    if (audience === "youth") {
      // Youth: ageGroup.minAge < 18 (overlaps with kids' ages), OR no ageGroup
      conditions.push(
        sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} < 18)`
      );
    } else if (audience === "adult") {
      // Adult: ageGroup.minAge >= 18, OR no ageGroup
      conditions.push(
        sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} >= 18)`
      );
    }
    // Always exclude test fixtures from the public catalog. Programs/seasons
    // are flagged via the `is_test` column (backfilled by migration 0009 and
    // set explicitly by the e2e seed). Playwright drives the registration flow
    // through admin endpoints with `?include_test=1`, not the public catalog.
    conditions.push(eq(seasons.isTest, false));
    conditions.push(eq(programs.isTest, false));
    // Defense-in-depth: only surface rows owned by an active organization.
    // CI/test orgs are soft-archived to status='inactive' (see PR #49), so
    // this clause hides leaked fixtures even if their programs/seasons
    // weren't tagged isTest=true.
    conditions.push(eq(organizations.status, "active"));

    const rows = await db
      .select({
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
        ageGroup: ageGroups,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(and(...conditions))
      .orderBy(asc(seasons.startDate));

    // Get registration counts for all seasons
    const seasonIds = rows.map((r) => r.season.id);
    const regCounts = seasonIds.length > 0
      ? await db
          .select({
            seasonId: registrations.seasonId,
            count: sql<number>`count(*)::int`,
          })
          .from(registrations)
          .where(
            and(
              sql`${registrations.seasonId} IN (${sql.join(seasonIds.map(id => sql`${id}`), sql`, `)})`,
              sql`${registrations.status} IN ('pending', 'confirmed')`
            )
          )
          .groupBy(registrations.seasonId)
      : [];

    const countMap = new Map(regCounts.map((r) => [r.seasonId, r.count]));

    const formatted = rows.map((r) => {
      const registeredCount = countMap.get(r.season.id) || 0;
      const spotsLeft = r.season.maxParticipants
        ? Math.max(0, r.season.maxParticipants - registeredCount)
        : null;

      return {
        id: r.season.id,
        name: r.season.name,
        slug: r.season.slug,
        startDate: r.season.startDate,
        endDate: r.season.endDate,
        price: r.season.priceCents / 100,
        teamPrice: r.season.teamPriceCents != null ? r.season.teamPriceCents / 100 : null,
        signupModes: r.season.signupModes,
        deposit: r.season.depositCents ? r.season.depositCents / 100 : null,
        allowDeposit: r.season.allowDeposit,
        pricingMode: r.season.pricingMode,
        maxParticipants: r.season.maxParticipants,
        registeredCount,
        spotsLeft,
        scheduleNotes: r.season.scheduleNotes,
        status: r.season.status,
        program: {
          id: r.program.id,
          name: r.program.name,
          slug: r.program.slug,
          programType: r.program.programType,
          audienceType: r.program.audienceType,
        },
        sport: {
          id: r.sport.id,
          name: r.sport.name,
          slug: r.sport.slug,
          icon: r.sport.icon,
          color: r.sport.color,
        },
        location: {
          id: r.location.id,
          name: r.location.name,
          slug: r.location.slug,
          city: r.location.city,
          state: r.location.state,
        },
        ageGroup: r.ageGroup
          ? {
              id: r.ageGroup.id,
              name: r.ageGroup.name,
              minAge: r.ageGroup.minAge,
              maxAge: r.ageGroup.maxAge,
            }
          : null,
      };
    });

    return new Response(JSON.stringify({ seasons: formatted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Catalog changes a few times per season; let browsers reuse it
        // across page views for 5 min instead of refetching on every
        // marketing-page visit. Cache key is the full URL incl. host, so
        // tenants never share entries.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("Error fetching seasons:", err);
    return new Response(JSON.stringify({ seasons: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
