/**
 * collectTodayForPerson
 *
 * Returns a person's drop-in bookings, field rentals, and game rosters for
 * a given UTC day, scoped to the caller's allowed location ids.
 *
 * Called only on the family_member path in buildPersonProfile — parents have
 * no direct session attendance, so the user/parent path keeps today: [].
 */
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues, teams, rosters, games } from "@/lib/db/schema/teams";
import { registrations } from "@/lib/db/schema/registrations";
import { programs, seasons } from "@/lib/db/schema/programs";
import type { PersonTodayItem } from "./person-types";

export interface CollectTodayOptions {
  familyMemberId: string;
  linkedUserId: string;
  allowedLocationIds: string[];
  /** UTC midnight at the start of "today". Caller passes new Date() truncated
   *  to day-boundary; we also accept a raw Date and truncate internally. */
  todayUtc: Date;
  /**
   * True when the family_member IS the account holder (adult-self, i.e.
   * selfUserId is set). False for COPPA children (parentUserId is set).
   *
   * Drop-in bookings and field rentals are keyed by userId (the adult's
   * account), so surfacing them on a child's card would mis-attribute the
   * parent's activity to every child. Only collect them for adult-self.
   */
  isSelf: boolean;
  /**
   * The photo URL for this person (family_member.photoUrl or user.avatarUrl).
   * Used to derive hasPhoto on each emitted item.
   */
  personPhotoUrl?: string | null;
}

/** Format a UTC Date as HH:MM (24-hour). */
function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** Build a "HH:MM – HH:MM" label from two UTC dates. */
function timeLabel(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export async function collectTodayForPerson(
  db: Database,
  opts: CollectTodayOptions,
): Promise<PersonTodayItem[]> {
  const { familyMemberId, linkedUserId, allowedLocationIds, todayUtc, isSelf, personPhotoUrl } = opts;
  const hasPhoto = Boolean(personPhotoUrl);

  // UTC day bounds — same pattern as lib/check-in/day-view.ts
  const dayStart = new Date(
    Date.UTC(
      todayUtc.getUTCFullYear(),
      todayUtc.getUTCMonth(),
      todayUtc.getUTCDate(),
    ),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const items: PersonTodayItem[] = [];

  // ── 1. Drop-in bookings ───────────────────────────────────────────────────
  // Only for adult-self: these are keyed by userId (the account holder).
  // Surfacing them on a child's card would show the parent's activity on every
  // child row (mis-attribution). Children get only roster_entry items below.
  //
  // Scope: session's venue must be in an allowed location.
  // We need to resolve venueIds whose locationId is in allowedLocationIds.
  let allowedVenueIds: string[] = [];
  if (isSelf && allowedLocationIds.length > 0) {
    const venueRows = await db
      .select({ id: venues.id })
      .from(venues)
      .where(inArray(venues.locationId, allowedLocationIds));
    allowedVenueIds = venueRows.map((v) => v.id);
  }

  if (isSelf && allowedVenueIds.length > 0) {
    const bookingRows = await db
      .select({
        bookingId: dropInBookings.id,
        sessionId: dropInSessions.id,
        title: dropInSessions.sportOrClassLabel,
        startsAt: dropInSessions.startsAt,
        endsAt: dropInSessions.endsAt,
        waiverSigned: dropInBookings.waiverSigned,
        checkedInAt: dropInBookings.checkedInAt,
        amountPaidCents: dropInBookings.amountPaidCents,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .where(
        and(
          eq(dropInBookings.userId, linkedUserId),
          eq(dropInBookings.status, "confirmed"),
          gte(dropInSessions.startsAt, dayStart),
          lt(dropInSessions.startsAt, dayEnd),
          inArray(dropInSessions.venueId, allowedVenueIds),
        ),
      );

    for (const row of bookingRows) {
      items.push({
        kind: "drop_in_booking",
        targetId: row.bookingId,
        canCheckIn: true,
        sessionId: row.sessionId,
        title: row.title,
        timeLabel: timeLabel(row.startsAt, row.endsAt),
        waiverSigned: row.waiverSigned,
        hasPhoto,
        paid: row.amountPaidCents > 0,
        checkedIn: row.checkedInAt !== null,
      });
    }
  }

  // ── 2. Field rentals ──────────────────────────────────────────────────────
  // Only for adult-self (same reasoning as drop-in bookings above).
  // Scope: rental's venue must be in an allowed location.
  // Only confirmed/completed rentals (not pending_payment, cancelled, no_show).
  if (isSelf && allowedVenueIds.length > 0) {
    const rentalRows = await db
      .select({
        rentalId: fieldRentals.id,
        renterName: fieldRentals.renterName,
        startsAt: fieldRentals.startsAt,
        endsAt: fieldRentals.endsAt,
        waiverSigned: fieldRentals.waiverSigned,
        checkedInAt: fieldRentals.checkedInAt,
        paymentStatus: fieldRentals.paymentStatus,
      })
      .from(fieldRentals)
      .where(
        and(
          eq(fieldRentals.renterUserId, linkedUserId),
          inArray(fieldRentals.status, ["confirmed", "completed"]),
          gte(fieldRentals.startsAt, dayStart),
          lt(fieldRentals.startsAt, dayEnd),
          inArray(fieldRentals.venueId, allowedVenueIds),
        ),
      );

    for (const row of rentalRows) {
      items.push({
        kind: "field_rental",
        targetId: row.rentalId,
        canCheckIn: true,
        sessionId: row.rentalId, // field rentals have no separate session; reuse id
        title: `Field Rental — ${row.renterName}`,
        timeLabel: timeLabel(row.startsAt, row.endsAt),
        waiverSigned: row.waiverSigned,
        hasPhoto,
        paid: row.paymentStatus === "paid",
        checkedIn: row.checkedInAt !== null,
      });
    }
  }

  // ── 3. Roster / game entries ──────────────────────────────────────────────
  // Find teams the familyMember is on (active roster, scoped to allowed
  // locations via program → season → team).
  // Scope: program.locationId in allowedLocationIds.
  if (allowedLocationIds.length > 0) {
    // Find all active roster entries for this family member in scoped programs.
    const rosterRows = await db
      .select({
        rosterId: rosters.id,
        teamId: rosters.teamId,
        seasonId: teams.seasonId,
      })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(teams, eq(teams.id, rosters.teamId))
      .innerJoin(seasons, eq(seasons.id, teams.seasonId))
      .innerJoin(programs, eq(programs.id, seasons.programId))
      .where(
        and(
          eq(registrations.familyMemberId, familyMemberId),
          eq(rosters.status, "active"),
          inArray(programs.locationId, allowedLocationIds),
        ),
      );

    if (rosterRows.length > 0) {
      const teamIds = [...new Set(rosterRows.map((r) => r.teamId))];

      // Find games today where this person's team plays (home or away).
      const gameRows = await db
        .select({
          gameId: games.id,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
          scheduledAt: games.scheduledAt,
          durationMinutes: games.durationMinutes,
        })
        .from(games)
        .where(
          and(
            or(
              inArray(games.homeTeamId, teamIds),
              inArray(games.awayTeamId, teamIds),
            ),
            gte(games.scheduledAt, dayStart),
            lt(games.scheduledAt, dayEnd),
            inArray(games.status, ["scheduled", "in_progress"]),
          ),
        );

      // Resolve team names for game titles.
      let teamNameMap = new Map<string, string>();
      if (gameRows.length > 0) {
        const allGameTeamIds = gameRows.flatMap((g) =>
          [g.homeTeamId, g.awayTeamId].filter(Boolean),
        ) as string[];
        const uniqueTeamIds = [...new Set(allGameTeamIds)];
        const teamNameRows = await db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .where(inArray(teams.id, uniqueTeamIds));
        teamNameMap = new Map(teamNameRows.map((t) => [t.id, t.name]));
      }

      for (const game of gameRows) {
        // Find the roster entry that links this person to one of the game's teams.
        const matchingRosterEntry = rosterRows.find(
          (r) => r.teamId === game.homeTeamId || r.teamId === game.awayTeamId,
        );
        if (!matchingRosterEntry) continue;

        const homeName = game.homeTeamId
          ? (teamNameMap.get(game.homeTeamId) ?? "TBD")
          : "TBD";
        const awayName = game.awayTeamId
          ? (teamNameMap.get(game.awayTeamId) ?? "TBD")
          : "TBD";

        const endsAt = new Date(
          game.scheduledAt.getTime() + (game.durationMinutes ?? 0) * 60_000,
        );

        items.push({
          kind: "roster_entry",
          targetId: matchingRosterEntry.rosterId,
          canCheckIn: false, // game attendance not tracked at row level
          sessionId: game.gameId,
          title: `${homeName} vs ${awayName}`,
          timeLabel: timeLabel(game.scheduledAt, endsAt),
          waiverSigned: true, // rostered players signed waiver at registration
          hasPhoto,
          paid: true, // registration payment is handled separately
          checkedIn: false, // not tracked
        });
      }
    }
  }

  return items;
}
