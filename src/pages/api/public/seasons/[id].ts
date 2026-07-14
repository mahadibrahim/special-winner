import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, registrations, organizations } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { isRegistrationClosed } from "@/lib/programs/registration-window";
import {
  isEarlyBirdActive,
  effectivePriceCents,
  isTeamEarlyBirdActive,
  effectiveTeamPriceCents,
} from "@/lib/programs/early-bird";

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const organization = locals.organization;
    if (!organization) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Season ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Season (with related data, enforcing tenant scope via org join) and
    // the registration count are independent reads — both only need `id`.
    // Fetch concurrently; a not-found season just means the count read was
    // wasted, which is fine (it's a plain, side-effect-free SELECT).
    const [[result], [countResult]] = await Promise.all([
      db
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
        // NEW: enforce active org + matching tenant
        .innerJoin(
          organizations,
          and(
            eq(organizations.id, sports.organizationId),
            eq(organizations.status, "active"),
            eq(organizations.id, organization.id),
          ),
        )
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
        .where(eq(seasons.id, id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(
          and(
            eq(registrations.seasonId, id),
            sql`${registrations.status} IN ('pending', 'confirmed')`
          )
        ),
    ]);

    if (!result) {
      return new Response(JSON.stringify({ error: "Season not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const registeredCount = countResult?.count || 0;
    const spotsLeft = result.season.maxParticipants
      ? Math.max(0, result.season.maxParticipants - registeredCount)
      : null;

    // Early-bird: server-computed so display and the charge path
    // (createRegistration) agree on the clock.
    const earlyBirdActive = isEarlyBirdActive(result.season);
    const effPriceCents = effectivePriceCents(result.season);
    // Team early-bird is independent of the per-player one — Aspire's leagues
    // run a team-only early-bird (solo pays flat list price by policy).
    const listTeamPriceCents = result.season.teamPriceCents;
    const teamEarlyBirdActive = isTeamEarlyBirdActive(result.season);
    const effTeamPriceCents =
      listTeamPriceCents != null
        ? effectiveTeamPriceCents(result.season, listTeamPriceCents)
        : null;

    const formatted = {
      id: result.season.id,
      name: result.season.name,
      slug: result.season.slug,
      startDate: result.season.startDate,
      endDate: result.season.endDate,
      registrationOpens: result.season.registrationOpens,
      maxParticipants: result.season.maxParticipants,
      registeredCount,
      spotsLeft,
      price: result.season.priceCents / 100,
      priceCents: result.season.priceCents,
      deposit: result.season.depositCents ? result.season.depositCents / 100 : null,
      depositCents: result.season.depositCents,
      allowDeposit: result.season.allowDeposit,
      status: result.season.status,
      registrationCloses: result.season.registrationCloses ? result.season.registrationCloses.toISOString() : null,
      // Server-computed so the register page and the API agree on the clock;
      // createRegistration enforces the same predicate on the write path.
      registrationClosed: isRegistrationClosed(result.season),
      earlyBirdDeadline: result.season.earlyBirdDeadline ? result.season.earlyBirdDeadline.toISOString() : null,
      // Price the register flow should actually charge/display right now —
      // the early-bird price while the window is active, list price otherwise.
      earlyBirdActive,
      effectivePrice: effPriceCents / 100,
      effectivePriceCents: effPriceCents,
      scheduleNotes: result.season.scheduleNotes,
      // Team pricing + signup capability (mirrors the list endpoint) so the
      // register page's league-context rail + choose-mode have what they need.
      teamPrice: result.season.teamPriceCents != null ? result.season.teamPriceCents / 100 : null,
      teamPriceCents: result.season.teamPriceCents,
      // Team fee the team-create flow will actually charge right now. The
      // charge path (api/public/team-registrations) computes the same value.
      teamEarlyBirdActive,
      effectiveTeamPrice: effTeamPriceCents != null ? effTeamPriceCents / 100 : null,
      effectiveTeamPriceCents: effTeamPriceCents,
      signupModes: result.season.signupModes,
      // Division metadata for the rail facts.
      termSlug: result.season.termSlug,
      termLabel: result.season.termLabel,
      divisionGender: result.season.divisionGender,
      skillLevel: result.season.skillLevel,
      dayOfWeek: result.season.dayOfWeek,
      startTime: result.season.startTime,
      endTime: result.season.endTime,
      program: {
        id: result.program.id,
        name: result.program.name,
        slug: result.program.slug,
        description: result.program.description,
        programType: result.program.programType,
      },
      sport: {
        id: result.sport.id,
        name: result.sport.name,
        slug: result.sport.slug,
        icon: result.sport.icon,
        color: result.sport.color,
      },
      location: {
        id: result.location.id,
        name: result.location.name,
        slug: result.location.slug,
        address: result.location.addressLine1,
        city: result.location.city,
        state: result.location.state,
      },
      ageGroup: result.ageGroup
        ? {
            id: result.ageGroup.id,
            name: result.ageGroup.name,
            minAge: result.ageGroup.minAge,
            maxAge: result.ageGroup.maxAge,
          }
        : null,
    };

    return new Response(JSON.stringify({ season: formatted }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Short TTL only — payload includes live spotsLeft counts. Enough
        // to absorb bursts without showing stale capacity for long.
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    console.error("Error fetching season:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
