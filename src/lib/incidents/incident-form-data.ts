/**
 * Options for the fast-capture incident form: which venues the staff
 * member may pick from, and which games are close enough in time to be
 * "the game this happened at" (so the form can auto-close that game's
 * act.incident_response activity_completions row on submit).
 */
import { getDb } from "@/lib/db";
import { and, asc, between, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { venues, teams, games } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

// A game more than 12h away from "now" isn't "the game this happened at" —
// keeps the picker to a manageable, relevant list on a phone.
const GAME_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface IncidentFormVenueOption {
  id: string;
  name: string;
}

export interface IncidentFormGameOption {
  id: string;
  scheduledAt: string;
  venueId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}

export interface IncidentFormOptions {
  venues: IncidentFormVenueOption[];
  games: IncidentFormGameOption[];
}

/**
 * `isLocationScoped` should be true only for location_admin (venue
 * managers) — coach and super_admin have no per-location scope
 * (getLocationIdsForUser returns [] for a team-scoped coach role, which
 * would otherwise wrongly zero out their venue list) and see every venue
 * in the org, same as other admin endpoints' isSuperAdmin bypass.
 */
export async function getIncidentFormOptions(opts: {
  organizationId: string;
  userId: string;
  isLocationScoped: boolean;
}): Promise<IncidentFormOptions> {
  const db = getDb();

  let venueRows: Array<{ id: string; name: string }>;
  if (opts.isLocationScoped) {
    const allowedLocationIds = await getLocationIdsForUser(opts.userId);
    if (allowedLocationIds.length === 0) {
      return { venues: [], games: [] };
    }
    venueRows = await db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .where(inArray(venues.locationId, allowedLocationIds))
      .orderBy(asc(venues.name));
  } else {
    venueRows = await db
      .select({ id: venues.id, name: venues.name })
      .from(venues)
      .innerJoin(locations, eq(venues.locationId, locations.id))
      .where(eq(locations.organizationId, opts.organizationId))
      .orderBy(asc(venues.name));
  }

  const venueIds = venueRows.map((v) => v.id);
  if (venueIds.length === 0) {
    return { venues: venueRows, games: [] };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - GAME_WINDOW_MS);
  const windowEnd = new Date(now.getTime() + GAME_WINDOW_MS);

  const home = alias(teams, "incident_home_team");
  const away = alias(teams, "incident_away_team");

  const gameRows = await db
    .select({
      id: games.id,
      scheduledAt: games.scheduledAt,
      venueId: games.venueId,
      homeTeamName: home.name,
      awayTeamName: away.name,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(
      and(
        inArray(games.venueId, venueIds),
        eq(locations.organizationId, opts.organizationId),
        between(games.scheduledAt, windowStart, windowEnd),
      ),
    )
    .orderBy(asc(games.scheduledAt));

  return {
    venues: venueRows,
    games: gameRows.map((g) => ({
      id: g.id,
      scheduledAt: g.scheduledAt.toISOString(),
      venueId: g.venueId,
      homeTeamName: g.homeTeamName,
      awayTeamName: g.awayTeamName,
    })),
  };
}
