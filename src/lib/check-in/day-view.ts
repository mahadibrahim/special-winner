/**
 * Merge drop-in sessions, scheduled/in-progress games, and field rentals
 * for a (venueId, date) into a single time-ordered list of DayEvent rows
 * the manager dashboard renders. Each event has the same summary shape
 * regardless of source.
 */
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { games, venues, teams, rosters } from "@/lib/db/schema/teams";

export type DayEventKind = "drop_in_session" | "game" | "field_rental";

export interface DayEvent {
  kind: DayEventKind;
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  fieldNumber: number | null;
  title: string;
  subtitle: string | null;
  counts: {
    expected: number;
    waiversOutstanding: number;
    checkedIn: number;
  };
}

export async function getVenueDayEvents(
  venueId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<{ venueName: string; events: DayEvent[] } | null> {
  const db = getDb();

  const [venue] = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return null;

  // ── Drop-in sessions today + their bookings ──────────────────────────────
  const sessions = await db
    .select({
      id: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
    })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.venueId, venueId),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, dayStart),
        lt(dropInSessions.startsAt, dayEnd),
      ),
    );

  const sessionIds = sessions.map((s) => s.id);
  const sessionBookings = sessionIds.length
    ? await db
        .select({
          sessionId: dropInBookings.sessionId,
          status: dropInBookings.status,
          waiverSigned: dropInBookings.waiverSigned,
          checkedInAt: dropInBookings.checkedInAt,
        })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, ["confirmed", "waitlisted"]),
          ),
        )
    : [];

  const dropInEvents: DayEvent[] = sessions.map((s) => {
    const rows = sessionBookings.filter((b) => b.sessionId === s.id);
    const expected = rows.filter((b) => b.status === "confirmed").length;
    const waiversOutstanding = rows.filter(
      (b) => b.status === "confirmed" && !b.waiverSigned,
    ).length;
    const checkedIn = rows.filter((b) => b.checkedInAt != null).length;
    return {
      kind: "drop_in_session",
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      fieldNumber: null, // drop-in sessions don't carry a field number yet
      title: s.sportOrClassLabel,
      subtitle: s.formatLabel ?? null,
      counts: { expected, waiversOutstanding, checkedIn },
    };
  });

  // ── Field rentals overlapping the day ────────────────────────────────────
  // Proper overlap: rental.startsAt < dayEnd AND rental.endsAt > dayStart
  const rentalRows = await db
    .select({
      id: fieldRentals.id,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      fieldNumber: fieldRentals.fieldNumber,
      renterName: fieldRentals.renterName,
      purpose: fieldRentals.purpose,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
    })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        eq(fieldRentals.status, "confirmed"),
        lt(fieldRentals.startsAt, dayEnd),
        gt(fieldRentals.endsAt, dayStart),
      ),
    );

  const rentalEvents: DayEvent[] = rentalRows.map((r) => ({
    kind: "field_rental",
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    fieldNumber: r.fieldNumber, // integer in schema — use directly
    title: r.renterName,
    subtitle: r.purpose ?? null,
    counts: {
      expected: 1, // rental = one booking; party_size lives in the detail view
      waiversOutstanding: r.waiverSigned ? 0 : 1,
      checkedIn: r.checkedInAt ? 1 : 0,
    },
  }));

  // ── Games scheduled today on this venue ──────────────────────────────────
  const gameRows = await db
    .select({
      id: games.id,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
      fieldNumber: games.fieldNumber, // varchar — coerce to number below
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        inArray(games.status, ["scheduled", "in_progress"]),
        gte(games.scheduledAt, dayStart),
        lt(games.scheduledAt, dayEnd),
      ),
    );

  const teamIds = Array.from(
    new Set(
      gameRows.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter(Boolean),
    ),
  ) as string[];

  const teamRows = teamIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds))
    : [];

  const teamName = (id: string | null | undefined): string =>
    id ? teamRows.find((t) => t.id === id)?.name ?? "TBD" : "TBD";

  // Count active rostered players per team for game expected totals.
  // waiversOutstanding = 0 (registration waiver signed at sign-up;
  // game-day capture is surfaced in the detail drawer, not the summary row).
  // checkedIn = 0 (game attendance is per-roster entry; surfaced in drawer).
  const gameRosterCounts = teamIds.length
    ? await db
        .select({
          teamId: rosters.teamId,
          c: sql<number>`count(*)::int`,
        })
        .from(rosters)
        .where(and(inArray(rosters.teamId, teamIds), eq(rosters.status, "active")))
        .groupBy(rosters.teamId)
    : [];

  const rosterCount = (teamId: string | null | undefined): number =>
    teamId ? gameRosterCounts.find((r) => r.teamId === teamId)?.c ?? 0 : 0;

  const gameEvents: DayEvent[] = gameRows.map((g) => {
    // games.fieldNumber is a varchar; coerce to number. Non-numeric values
    // produce NaN — the rendering layer falls back to a "—" label for NaN.
    const rawField = g.fieldNumber;
    const fieldNumber =
      rawField !== null && rawField !== undefined
        ? (() => {
            const n = Number(rawField);
            return Number.isNaN(n) ? null : n;
          })()
        : null;

    const expected = rosterCount(g.homeTeamId) + rosterCount(g.awayTeamId);
    return {
      kind: "game",
      id: g.id,
      startsAt: g.scheduledAt.toISOString(),
      endsAt: new Date(
        g.scheduledAt.getTime() + (g.durationMinutes ?? 0) * 60_000,
      ).toISOString(),
      fieldNumber,
      title: `${teamName(g.homeTeamId)} vs ${teamName(g.awayTeamId)}`,
      subtitle: null,
      counts: {
        expected,
        waiversOutstanding: 0,
        checkedIn: 0,
      },
    };
  });

  // ── Merge + sort ──────────────────────────────────────────────────────────
  const events = [...dropInEvents, ...rentalEvents, ...gameEvents].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt),
  );

  return { venueName: venue.name, events };
}
