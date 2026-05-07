/**
 * Builds a game context inside the org that the seeded admin's HTTP requests
 * will resolve to (super_admin → oldest active HQ → "aspire-sports"). This
 * allows API integration tests for /api/admin/* endpoints to find their
 * fixtures inside the resolved org context.
 *
 * Differs from `createTestGameContext` in `activity-tracking-helpers.ts`,
 * which creates a fresh isolated org. That helper is right for unit-style
 * tests that call the activity-tracking library directly — but HTTP tests
 * need to stay inside the seeded admin's org.
 */
import { getDb } from "@/lib/db";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { programs, seasons } from "@/lib/db/schema/programs";
import { teams, games, venues } from "@/lib/db/schema/teams";
import { eq } from "drizzle-orm";

export async function createAdminOrgGameContext(opts: {
  indoor?: boolean;
  owned?: boolean;
  concessions?: boolean;
  parkingManaged?: boolean;
  programType?: "league" | "camp" | "clinic" | "tournament" | "training";
  audienceType?: "parents" | "players";
  sportSlug?: string;
  scheduledAt?: Date;
} = {}): Promise<{
  organizationId: string;
  locationId: string;
  venueId: string;
  programId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
}> {
  const db = getDb();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // Resolve the admin org — must already exist (seeded as "aspire-sports").
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);
  if (!org) {
    throw new Error(
      "Admin org 'aspire-sports' not found — run npm run db:seed:e2e first.",
    );
  }

  // Reuse any existing location in this org, else create one.
  const [existingLoc] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, org.id))
    .limit(1);
  const location =
    existingLoc ??
    (
      await db
        .insert(locations)
        .values({
          organizationId: org.id,
          name: `Loc-${stamp}`,
          slug: `loc-${stamp}`,
          timezone: "America/New_York",
        })
        .returning()
    )[0];

  // Sport — slug must be unique per org, so suffix with stamp.
  const sportSlug = `${opts.sportSlug ?? "soccer"}-${stamp}`;
  const [sport] = await db
    .insert(sports)
    .values({
      organizationId: org.id,
      name: opts.sportSlug ?? "soccer",
      slug: sportSlug,
    })
    .returning();

  const [ageGroup] = await db
    .insert(ageGroups)
    .values({
      organizationId: org.id,
      name: `U10-${stamp}`,
      minAge: 8,
      maxAge: 10,
    })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: `Test Program ${stamp}`,
      slug: `test-program-${stamp}`,
      programType: opts.programType ?? "league",
      audienceType: opts.audienceType ?? "parents",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      programId: program.id,
      ageGroupId: ageGroup.id,
      name: `Season ${stamp}`,
      slug: `season-${stamp}`,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 60 * 86400 * 1000)
        .toISOString()
        .split("T")[0],
      priceCents: 15000,
    })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({
      locationId: location.id,
      name: `Venue-${stamp}`,
      indoor: opts.indoor ?? false,
      owned: opts.owned ?? false,
      concessions: opts.concessions ?? false,
      parkingManaged: opts.parkingManaged ?? false,
    })
    .returning();

  const [home] = await db
    .insert(teams)
    .values({ seasonId: season.id, name: `Home-${stamp}` })
    .returning();
  const [away] = await db
    .insert(teams)
    .values({ seasonId: season.id, name: `Away-${stamp}` })
    .returning();

  const [game] = await db
    .insert(games)
    .values({
      seasonId: season.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      venueId: venue.id,
      scheduledAt: opts.scheduledAt ?? new Date("2026-06-03T18:00:00Z"),
      status: "scheduled",
    })
    .returning();

  return {
    organizationId: org.id,
    locationId: location.id,
    venueId: venue.id,
    programId: program.id,
    seasonId: season.id,
    homeTeamId: home.id,
    awayTeamId: away.id,
    gameId: game.id,
  };
}
