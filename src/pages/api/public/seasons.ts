import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, registrations } from "@/lib/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

// Mock data for preview when DB has no seasons
const mockSeasons = [
  {
    id: "1",
    name: "U8 Soccer - Fall 2024",
    slug: "u8-soccer-fall-2024",
    startDate: "2024-10-05",
    endDate: "2024-12-15",
    price: 150,
    deposit: 25,
    allowDeposit: true,
    maxParticipants: 50,
    registeredCount: 27,
    spotsLeft: 23,
    scheduleNotes: "Saturdays 9-10am",
    status: "open",
    program: { id: "1", name: "Youth Soccer League", slug: "youth-soccer-league", programType: "league" },
    sport: { id: "1", name: "Soccer", slug: "soccer", icon: "⚽", color: "#22c55e" },
    location: { id: "1", name: "Powell", slug: "powell", city: "Powell", state: "OH" },
    ageGroup: { id: "1", name: "U8", minAge: 6, maxAge: 8 },
  },
];

export const GET: APIRoute = async ({ url }) => {
  const locationSlug = url.searchParams.get("location");
  const sportSlug = url.searchParams.get("sport");
  const status = url.searchParams.get("status");

  try {
    if (!db) throw new Error("No DB");

    // Build query conditions
    const conditions = [];
    if (status) {
      conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
    }
    if (locationSlug && locationSlug !== "all") {
      conditions.push(eq(locations.slug, locationSlug));
    }
    if (sportSlug) {
      conditions.push(eq(sports.slug, sportSlug));
    }
    // Always exclude test fixtures from the public catalog. Programs/seasons
    // are flagged via the `is_test` column (backfilled by migration 0009 and
    // set explicitly by the e2e seed). Playwright drives the registration flow
    // through admin endpoints with `?include_test=1`, not the public catalog.
    conditions.push(eq(seasons.isTest, false));
    conditions.push(eq(programs.isTest, false));

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
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(seasons.startDate));

    if (rows.length === 0) {
      // Fall back to mock data if DB has no seasons
      return new Response(JSON.stringify({ seasons: mockSeasons }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get registration counts for all seasons
    const seasonIds = rows.map((r) => r.season.id);
    const regCounts = await db
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
      .groupBy(registrations.seasonId);

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
        deposit: r.season.depositCents ? r.season.depositCents / 100 : null,
        allowDeposit: r.season.allowDeposit,
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error fetching seasons:", err);
    // Fall back to mock data on any error
    let filteredSeasons = mockSeasons;
    if (locationSlug && locationSlug !== "all") {
      filteredSeasons = filteredSeasons.filter((s) => s.location.slug === locationSlug);
    }
    if (sportSlug) {
      filteredSeasons = filteredSeasons.filter((s) => s.sport.slug === sportSlug);
    }
    return new Response(JSON.stringify({ seasons: filteredSeasons }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
