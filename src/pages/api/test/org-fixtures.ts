/**
 * GET /api/test/org-fixtures?slug=<org-slug>
 *
 * Test-only endpoint that returns the first program, season, venue, sport
 * and location belonging to the org identified by `slug`.
 *
 * ONLY available when E2E_TEST_ENDPOINTS=yes (CI / local test runs).
 * Returns 404 otherwise. Deliberately NOT keyed off DISABLE_RATE_LIMIT —
 * that flag exists to relax rate limiting and someone setting it for that
 * purpose should not silently open a fixture endpoint that dumps an org's
 * resource IDs and team registration tokens.
 *
 * Used by admin-tenant-scoping.test.ts to discover Org B resource IDs
 * without requiring Host header routing (which Node.js fetch does not
 * support — it strips the Host header per the Fetch spec).
 */

import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { programs, seasons } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { venues } from "@/lib/db/schema/teams";
import { teamRegistrations } from "@/lib/db/schema/team-registrations";
import { eq, asc } from "drizzle-orm";

export const GET: APIRoute = async ({ url }) => {
  // Only available in test/dev environments — explicit opt-in.
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "slug param required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) {
    return new Response(JSON.stringify({ error: "Org not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, org.id))
    .orderBy(asc(locations.createdAt))
    .limit(1);

  const [sport] = await db
    .select()
    .from(sports)
    .where(eq(sports.organizationId, org.id))
    .orderBy(asc(sports.createdAt))
    .limit(1);

  // Programs join through location
  let program: { id: string } | undefined;
  if (location) {
    const [p] = await db
      .select({ id: programs.id, name: programs.name, slug: programs.slug })
      .from(programs)
      .where(eq(programs.locationId, location.id))
      .orderBy(asc(programs.createdAt))
      .limit(1);
    program = p;
  }

  // Seasons join through program
  let season: { id: string } | undefined;
  if (program) {
    const [s] = await db
      .select({ id: seasons.id, name: seasons.name, slug: seasons.slug })
      .from(seasons)
      .where(eq(seasons.programId, program.id))
      .orderBy(asc(seasons.createdAt))
      .limit(1);
    season = s;
  }

  // Venues join through location
  let venue: { id: string } | undefined;
  if (location) {
    const [v] = await db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(eq(venues.locationId, location.id))
      .orderBy(asc(venues.createdAt))
      .limit(1);
    venue = v;
  }

  // Team registration invite token — first row for this org (oldest)
  const [teamReg] = await db
    .select({ id: teamRegistrations.id, inviteToken: teamRegistrations.inviteToken })
    .from(teamRegistrations)
    .where(eq(teamRegistrations.organizationId, org.id))
    .orderBy(asc(teamRegistrations.createdAt))
    .limit(1);

  return new Response(
    JSON.stringify({
      org: { id: org.id, slug: org.slug, name: org.name },
      locationId: location?.id ?? null,
      locationSlug: location?.slug ?? null,
      sportId: sport?.id ?? null,
      sportSlug: sport?.slug ?? null,
      programId: program?.id ?? null,
      seasonId: season?.id ?? null,
      venueId: venue?.id ?? null,
      teamRegToken: teamReg?.inviteToken ?? null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
