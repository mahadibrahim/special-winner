import { getDb } from "@/lib/db";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { sports, ageGroups } from "@/lib/db/schema/sports";
import { programs, seasons } from "@/lib/db/schema/programs";
import { teams, games, venues } from "@/lib/db/schema/teams";

/**
 * Insert a complete chain of org/location/sport/program/season/venue/teams/game
 * rows for activity-tracking integration tests.
 *
 * Field ownership note: `games`, `programs`, `seasons`, `venues`, and `teams`
 * do NOT carry their own `organizationId` column. Org context flows through
 * `season → program → location → organization`. The bootstrap module reads
 * the same join chain to populate `activity_completions.organization_id`.
 */
export async function createTestGameContext(opts: {
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

  const [org] = await db
    .insert(organizations)
    .values({
      name: `T-${stamp}`,
      slug: `t-${stamp}`,
      timezone: "America/New_York",
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      organizationId: org.id,
      name: `Loc-${stamp}`,
      slug: `loc-${stamp}`,
      timezone: "America/New_York",
    })
    .returning();

  const sportSlug = opts.sportSlug ?? "soccer";
  const [sport] = await db
    .insert(sports)
    .values({
      organizationId: org.id,
      name: sportSlug,
      slug: sportSlug,
    })
    .returning();

  const [ageGroup] = await db
    .insert(ageGroups)
    .values({
      organizationId: org.id,
      name: "U10",
      minAge: 8,
      maxAge: 10,
    })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: "Test Program",
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
      name: "Spring 2026",
      slug: `spring-2026-${stamp}`,
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
    .values({ seasonId: season.id, name: "Home" })
    .returning();
  const [away] = await db
    .insert(teams)
    .values({ seasonId: season.id, name: "Away" })
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
