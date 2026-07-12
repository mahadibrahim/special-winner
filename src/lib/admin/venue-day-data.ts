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
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { venueResources, resourceBlocks } from "@/lib/db/schema/scheduling";
import { and, count, eq, gte, inArray, lt, ne, notInArray } from "drizzle-orm";

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
  /** Front-desk label — see resourceDisplayName. */
  displayName: string;
};

/**
 * Human label for a field resource. The 0040 backfill named every inner
 * field "Field 1", so for single-field spaces the space (venue) name is the
 * only meaningful label ("Blue Field"). Multi-field spaces qualify with the
 * field name, unless it merely repeats the space name.
 */
export function resourceDisplayName(
  venueName: string,
  resourceName: string,
  venueResourceCount: number,
): string {
  if (venueResourceCount === 1 || resourceName === venueName) return venueName;
  return `${venueName} · ${resourceName}`;
}

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
        // Cancelled and postponed games don't occupy the field at their
        // scheduled slot — keep scheduled/in_progress/completed so the board
        // remains a full record of the day (unlike the arrivals-focused
        // check-in day view, which shows scheduled/in_progress only).
        notInArray(games.status, ["cancelled", "postponed"]),
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
      // Keep game-day links inside venue-manager scope: /admin/games is
      // super-admin-only, but this activity block is visible to
      // location_admins on the venue command center. Land back on the same
      // day with the game's session panel open.
      href: `/admin/venue?date=${date}&session=${g.id}&locationId=${locationId}`,
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
        // A cancelled session's field time is released — it must not render
        // on the board. `completed` stays visible: the board is a record of
        // the whole day, and the desk may still open a finished session's
        // roster (late check-in, attendance review). This deliberately
        // differs from the arrivals-focused check-in day view
        // (lib/check-in/day-view.ts), which lists `scheduled` only.
        ne(dropInSessions.status, "cancelled"),
      ),
    );

  // Booked-count per session: confirmed + pending_payment (walk-in pay-link
  // holds) + pending_claim (waitlist promotions) all occupy a slot, so all
  // three count toward "how full is this block". One grouped query for
  // every drop-in session in the day window — not per-session — to keep
  // this a fixed number of queries regardless of how many sessions the day
  // has.
  // NOTE: this intentionally diverges from getVenueReports' `booked` metric
  // (lib/admin/venue-reports.ts), which counts status='confirmed' only —
  // the day board answers "how full is this slot right now" (holds count),
  // reports answer "how many people actually booked" (holds don't count).
  const dropInSessionIds = dropInRows.map((s) => s.id);
  const bookingCounts = dropInSessionIds.length
    ? await db
        .select({ sessionId: dropInBookings.sessionId, n: count() })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, dropInSessionIds),
            inArray(dropInBookings.status, ["confirmed", "pending_payment", "pending_claim"]),
          ),
        )
        .groupBy(dropInBookings.sessionId)
    : [];
  const countBySession = new Map(bookingCounts.map((r) => [r.sessionId, r.n]));

  const dropInBlocks: ActivityBlock[] = dropInRows.map((s) => ({
    id: s.id,
    type: s.kind === "class" ? "class" : "drop_in",
    startAt: s.startsAt.toISOString(),
    endAt: s.endsAt.toISOString(),
    title: s.label,
    subtitle: [s.format, s.venueName].filter(Boolean).join(" · "),
    venueName: s.venueName,
    refAssigned: null,
    capacityCurrent: countBySession.get(s.id) ?? 0,
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
        // Cancelled rentals release the slot — hide them. Everything else
        // stays: pending_payment holds occupy the slot (same logic as
        // pending_claim bookings counting toward drop-in capacity — see the
        // schema's active-slot unique index), and completed/no_show are the
        // day's history.
        ne(fieldRentals.status, "cancelled"),
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
  const rawResourceRows = await db
    .select({
      id: venueResources.id,
      venueId: venueResources.venueId,
      venueName: venues.name,
      name: venueResources.name,
      fieldNumber: venueResources.fieldNumber,
    })
    .from(venueResources)
    .innerJoin(venues, eq(venueResources.venueId, venues.id))
    .where(
      and(
        eq(venues.locationId, locationId),
        eq(venueResources.active, true),
        // A deactivated space must not contribute board columns (the
        // Worthington "Field 3" ghost-column bug).
        eq(venues.active, true),
      ),
    )
    .orderBy(venues.name, venueResources.sortOrder);

  const resourceCountByVenue = new Map<string, number>();
  for (const r of rawResourceRows) {
    resourceCountByVenue.set(r.venueId, (resourceCountByVenue.get(r.venueId) ?? 0) + 1);
  }
  const resourceRows = rawResourceRows.map((r) => ({
    ...r,
    displayName: resourceDisplayName(
      r.venueName,
      r.name,
      resourceCountByVenue.get(r.venueId) ?? 1,
    ),
  }));

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
