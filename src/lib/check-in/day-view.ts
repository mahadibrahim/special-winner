/**
 * Merge drop-in sessions, scheduled/in-progress games, and field rentals
 * for a (venueId, date) into a single time-ordered list of DayEvent rows
 * the manager dashboard renders. Each event has the same summary shape
 * regardless of source.
 *
 * `waiversOutstanding` is a WORK QUEUE, not a column read: a person counts
 * only when they are BOTH unstamped on this row AND uncovered by the org's
 * annual liability waiver (src/lib/consents/liability.ts). A family who signed
 * three weeks ago at another door is covered — sending the desk after them is
 * a false alarm, and a dashboard that cries wolf is one the desk stops
 * reading. Coverage is resolved in ONE batch for the whole day view, not per
 * row: this is a hot staff dashboard on a 5s poll.
 */
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { locations } from "@/lib/db/schema/organizations";
import { games, venues, teams, rosters } from "@/lib/db/schema/teams";
import { hasValidLiabilityWaiverBatch } from "@/lib/consents/liability";
import { findSelfPersonIds } from "@/lib/registrations/resolve-person";

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

  // The org comes from venue → location: waiver coverage is an ORG-scoped
  // legal release, and the venue is the only handle this function is given.
  const [venue] = await db
    .select({
      id: venues.id,
      name: venues.name,
      organizationId: locations.organizationId,
    })
    .from(venues)
    .innerJoin(locations, eq(locations.id, venues.locationId))
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
          // WHO the booking is for. familyMemberId is set only when the
          // participant is not the booking's user (a kiosk walk-in for a
          // minor); otherwise the booker IS the participant and their SELF
          // person row is the one coverage hangs off.
          familyMemberId: dropInBookings.familyMemberId,
          userId: dropInBookings.userId,
        })
        .from(dropInBookings)
        .where(
          and(
            inArray(dropInBookings.sessionId, sessionIds),
            inArray(dropInBookings.status, ["confirmed", "waitlisted"]),
          ),
        )
    : [];

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
      // Rentals carry no participant row — coverage hangs off the renter's
      // SELF person. A guest rental (no account) has no person and so no
      // coverage, which is correct: it also has no way to have signed before.
      renterUserId: fieldRentals.renterUserId,
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

  // ── Annual-waiver coverage for everyone on the day, in one pass ──────────
  // Two queries to name the people (self-person lookup for the account-only
  // rows) plus the batch predicate's own three, for the WHOLE view — never
  // per row. `isCovered` is consulted by both the drop-in and rental counts
  // below, and answers false for anyone this pass could not resolve, which
  // leaves them counted as outstanding.
  const selfUserIds = [
    ...sessionBookings.filter((b) => !b.familyMemberId).map((b) => b.userId),
    ...rentalRows.map((r) => r.renterUserId),
  ].filter((id): id is string => Boolean(id));

  let coveredPersonIds = new Set<string>();
  let selfPersonByUser = new Map<string, string>();
  try {
    selfPersonByUser = await findSelfPersonIds(db, selfUserIds);
    const personIds = [
      ...sessionBookings.map((b) => b.familyMemberId),
      ...selfPersonByUser.values(),
    ].filter((id): id is string => Boolean(id));
    const verdicts = await hasValidLiabilityWaiverBatch(
      personIds,
      venue.organizationId,
      db,
    );
    coveredPersonIds = new Set(
      [...verdicts.entries()].filter(([, ok]) => ok).map(([id]) => id),
    );
  } catch (err) {
    // Fail toward OUTSTANDING: an empty coverage set restores the old
    // stamp-only count, i.e. the desk is sent after people who may already be
    // covered. Overcounting wastes a question; undercounting misses a release.
    console.error("[check-in/day-view] waiver coverage batch failed", err);
  }

  /** Coverage for a row, given its participant person or its account holder. */
  const isCovered = (
    familyMemberId: string | null,
    userId: string | null,
  ): boolean => {
    const personId =
      familyMemberId ?? (userId ? selfPersonByUser.get(userId) ?? null : null);
    return personId !== null && coveredPersonIds.has(personId);
  };

  const dropInEvents: DayEvent[] = sessions.map((s) => {
    const rows = sessionBookings.filter((b) => b.sessionId === s.id);
    const expected = rows.filter((b) => b.status === "confirmed").length;
    // Outstanding = unstamped on this booking AND uncovered by the annual
    // waiver. A covered-but-unstamped booking is a bookkeeping gap, not a
    // missing release, and must not put the desk to work.
    const waiversOutstanding = rows.filter(
      (b) =>
        b.status === "confirmed" &&
        !b.waiverSigned &&
        !isCovered(b.familyMemberId, b.userId),
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
      waiversOutstanding:
        r.waiverSigned || isCovered(null, r.renterUserId) ? 0 : 1,
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
