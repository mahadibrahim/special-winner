/**
 * Server-side data fetch for the Venue Day route.
 *
 * Pulls all activity blocks (games, drop-in sessions, rentals) at a given
 * location on a given calendar day, normalizes them into a shared
 * ActivityBlock shape, and returns them sorted by start time.
 *
 * The 6 activity types from the spec map onto current schema as follows:
 *   - league_game     → games rows where the parent program's programType = "league"
 *   - tournament_game → games rows where the parent program's programType = "tournament"
 *   - drop_in         → dropInSessions rows where kind = "pickup"
 *   - class           → dropInSessions rows where kind = "class"
 *   - rental          → fieldRentals rows
 *
 * Camps (programs with programType = "camp") have no per-day scheduling
 * surface in the schema yet — they're a known gap to address in Phase 4 (or
 * via a separate "camp sessions" table). Not blocked on for the v1 Venue Day.
 */

import { getDb } from "@/lib/db";
import { games, teams, venues, gameOfficials } from "@/lib/db/schema/teams";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { venueResources, resourceBlocks } from "@/lib/db/schema/scheduling";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

export type ActivityType =
  | "league_game"
  | "tournament_game"
  | "drop_in"
  | "class"
  | "camp"
  | "rental"
  | "external"
  | "maintenance";

export type ActivityBlock = {
  id: string;
  type: ActivityType;
  startAt: string; // ISO
  endAt: string;
  title: string;
  subtitle: string;
  venueName: string | null;
  refAssigned: boolean | null; // null when concept doesn't apply (drop-in, rental)
  capacityCurrent: number | null;
  capacityMax: number | null;
  // Deep-link target for the primary action on this block (e.g. check-in
  // for a roster, view details for a rental). Caller can override.
  href: string | null;
  // Field-time ledger attribution. resourceName groups the calendar by
  // field; blockId is set ONLY for manual (external/maintenance) holds —
  // it's the deletion handle.
  resourceName: string | null;
  blockId: string | null;
};

export type VenueResourceSummary = {
  id: string;
  venueId: string;
  venueName: string;
  name: string;
  fieldNumber: number;
};

export type VenueDayData = {
  date: string; // YYYY-MM-DD
  locationId: string;
  locationName: string;
  blocks: ActivityBlock[];
  /** The location's fields — the calendar's columns and the Add Hold picker. */
  resources: VenueResourceSummary[];
  closeAt: string | null;
};

export async function getVenueDayData(
  locationId: string,
  date: string,
): Promise<VenueDayData | null> {
  const db = getDb();

  const [loc] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!loc) return null;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  // --- Games ---
  // Join through venue → location, plus the program (for programType =
  // tournament vs. league) and home/away team names for the title.
  const homeTeams = teams; // alias is implicit via separate select for clarity
  const gameRows = await db
    .select({
      id: games.id,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
      fieldNumber: games.fieldNumber,
      programType: programs.programType,
      homeTeamName: homeTeams.name,
      venueName: venues.name,
    })
    .from(games)
    .innerJoin(venues, eq(games.venueId, venues.id))
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(homeTeams, eq(games.homeTeamId, homeTeams.id))
    .where(
      and(
        eq(venues.locationId, locationId),
        gte(games.scheduledAt, dayStart),
        lt(games.scheduledAt, dayEnd),
      ),
    );

  // For the title we also want the away team name. Resolve in a follow-up
  // pass to avoid the self-join complexity.
  const awayTeamRows = await db
    .select({ gameId: games.id, name: teams.name })
    .from(games)
    .innerJoin(venues, eq(games.venueId, venues.id))
    .leftJoin(teams, eq(games.awayTeamId, teams.id))
    .where(
      and(
        eq(venues.locationId, locationId),
        gte(games.scheduledAt, dayStart),
        lt(games.scheduledAt, dayEnd),
      ),
    );
  const awayNameById = new Map<string, string | null>(
    awayTeamRows.map((r) => [r.gameId, r.name]),
  );

  // Ref assignments for the day's games — one query, set lookup.
  const gameIds = gameRows.map((g) => g.id);
  const officialRows =
    gameIds.length > 0
      ? await db
          .select({ gameId: gameOfficials.gameId })
          .from(gameOfficials)
          .where(inArray(gameOfficials.gameId, gameIds))
      : [];
  const gamesWithRef = new Set(officialRows.map((r) => r.gameId));

  const gameBlocks: ActivityBlock[] = gameRows.map((g) => {
    const duration = g.durationMinutes ?? 60;
    const endAt = new Date(g.scheduledAt.getTime() + duration * 60_000);
    const home = g.homeTeamName ?? "TBD";
    const away = awayNameById.get(g.id) ?? "TBD";
    const type: ActivityType =
      g.programType === "tournament" ? "tournament_game" : "league_game";
    return {
      id: g.id,
      type,
      startAt: g.scheduledAt.toISOString(),
      endAt: endAt.toISOString(),
      title: `${home} vs ${away}`,
      subtitle: g.fieldNumber ? `Field ${g.fieldNumber}` : (g.venueName ?? ""),
      venueName: g.venueName,
      refAssigned: gamesWithRef.has(g.id),
      capacityCurrent: null,
      capacityMax: null,
      href: `/admin/games/${g.id}`,
      resourceName: g.fieldNumber ? `Field ${g.fieldNumber}` : null,
      blockId: null,
    };
  });

  // --- Drop-in sessions (pickup + class) ---
  const dropInRows = await db
    .select({
      id: dropInSessions.id,
      kind: dropInSessions.kind,
      label: dropInSessions.sportOrClassLabel,
      format: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      capacity: dropInSessions.capacity,
      venueName: venues.name,
      resourceName: venueResources.name,
    })
    .from(dropInSessions)
    .innerJoin(venues, eq(dropInSessions.venueId, venues.id))
    .leftJoin(
      venueResources,
      eq(dropInSessions.bookableResourceId, venueResources.id),
    )
    .where(
      and(
        eq(venues.locationId, locationId),
        gte(dropInSessions.startsAt, dayStart),
        lt(dropInSessions.startsAt, dayEnd),
      ),
    );

  const dropInBlocks: ActivityBlock[] = dropInRows.map((s) => ({
    id: s.id,
    type: s.kind === "class" ? "class" : "drop_in",
    startAt: s.startsAt.toISOString(),
    endAt: s.endsAt.toISOString(),
    title: s.label,
    subtitle: [s.format, s.venueName].filter(Boolean).join(" · "),
    venueName: s.venueName,
    refAssigned: null,
    capacityCurrent: null, // TODO: count active bookings; Phase-3 enhancement
    capacityMax: s.capacity,
    href: `/admin/dropin/sessions/${s.id}`,
    resourceName: s.resourceName ?? null,
    blockId: null,
  }));

  // --- Field rentals ---
  const rentalRows = await db
    .select({
      id: fieldRentals.id,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      fieldNumber: fieldRentals.fieldNumber,
      renterName: fieldRentals.renterName,
      venueName: venues.name,
    })
    .from(fieldRentals)
    .innerJoin(venues, eq(fieldRentals.venueId, venues.id))
    .where(
      and(
        eq(venues.locationId, locationId),
        gte(fieldRentals.startsAt, dayStart),
        lt(fieldRentals.startsAt, dayEnd),
      ),
    );

  const rentalBlocks: ActivityBlock[] = rentalRows.map((r) => ({
    id: r.id,
    type: "rental",
    startAt: r.startsAt.toISOString(),
    endAt: r.endsAt.toISOString(),
    title: r.renterName,
    subtitle: `Field ${r.fieldNumber}${r.venueName ? ` · ${r.venueName}` : ""}`,
    venueName: r.venueName,
    refAssigned: null,
    capacityCurrent: null,
    capacityMax: null,
    href: `/admin/rentals/${r.id}`,
    resourceName: `Field ${r.fieldNumber}`,
    blockId: null,
  }));

  // --- Field resources + manual holds (field-time ledger) ---
  const resourceRows = await db
    .select({
      id: venueResources.id,
      venueId: venueResources.venueId,
      venueName: venues.name,
      name: venueResources.name,
      fieldNumber: venueResources.fieldNumber,
    })
    .from(venueResources)
    .innerJoin(venues, eq(venueResources.venueId, venues.id))
    .where(and(eq(venues.locationId, locationId), eq(venueResources.active, true)))
    .orderBy(venues.name, venueResources.sortOrder);

  const resourceIds = resourceRows.map((r) => r.id);
  const resourceNameById = new Map(resourceRows.map((r) => [r.id, r.name]));
  const venueNameByResourceId = new Map(
    resourceRows.map((r) => [r.id, r.venueName]),
  );

  // External (Good Rec / email) + maintenance holds live ONLY in the
  // ledger — this is where the partner's bookings become visible.
  const manualRows =
    resourceIds.length > 0
      ? await db
          .select()
          .from(resourceBlocks)
          .where(
            and(
              inArray(resourceBlocks.resourceId, resourceIds),
              inArray(resourceBlocks.sourceType, ["external", "maintenance"]),
              lt(resourceBlocks.startsAt, dayEnd),
              gte(resourceBlocks.endsAt, dayStart),
            ),
          )
      : [];

  const manualBlocks: ActivityBlock[] = manualRows.map((m) => ({
    id: m.id,
    type: m.sourceType === "maintenance" ? "maintenance" : "external",
    startAt: m.startsAt.toISOString(),
    endAt: m.endsAt.toISOString(),
    title: m.label,
    subtitle: [
      resourceNameById.get(m.resourceId),
      m.sourceType === "maintenance" ? "Maintenance" : "External booking",
    ]
      .filter(Boolean)
      .join(" · "),
    venueName: venueNameByResourceId.get(m.resourceId) ?? null,
    refAssigned: null,
    capacityCurrent: null,
    capacityMax: null,
    href: null,
    resourceName: resourceNameById.get(m.resourceId) ?? null,
    blockId: m.id,
  }));

  const blocks = [
    ...gameBlocks,
    ...dropInBlocks,
    ...rentalBlocks,
    ...manualBlocks,
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  return {
    date,
    locationId: loc.id,
    locationName: loc.name,
    blocks,
    resources: resourceRows,
    closeAt: null,
  };
}
