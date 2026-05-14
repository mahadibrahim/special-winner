/**
 * Computes free rental blocks for a venue on a given calendar date.
 *
 * Free = the venue's rental window (rentalOpenMinute..rentalCloseMinute)
 * minus scheduled/in-progress games on that (venueId, fieldNumber) minus
 * confirmed + non-expired pending_payment rentals on that field.
 *
 * Drop-in sessions are intentionally excluded from the v1 conflict net —
 * they carry no field number. See the spec's "Availability + conflict
 * detection" section.
 */
import { and, eq, gte, lt, inArray, isNull, or, gt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues, games } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { subtractBusyBlocks, type TimeBlock } from "./overlap";

export interface FieldAvailability {
  fieldNumber: number;
  free: TimeBlock[];
}

export async function getVenueRentalAvailability(
  venueId: string,
  /** Start of the calendar day, UTC instant for the org's local midnight. */
  dayStart: Date,
  /** End of the calendar day (dayStart + 24h). */
  dayEnd: Date,
): Promise<{ venueName: string; fields: FieldAvailability[] } | null> {
  const db = getDb();

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || !venue.rentalEnabled) return null;

  const fieldCount = venue.fieldCount ?? 1;

  // Venue rental window for the day. Null open/close → full day.
  const windowStart =
    venue.rentalOpenMinute != null
      ? new Date(dayStart.getTime() + venue.rentalOpenMinute * 60_000)
      : dayStart;
  const windowEnd =
    venue.rentalCloseMinute != null
      ? new Date(dayStart.getTime() + venue.rentalCloseMinute * 60_000)
      : dayEnd;

  // Games on this venue overlapping the day. A game overlaps the day when it
  // starts before dayEnd AND its computed end (scheduledAt + durationMinutes)
  // is after dayStart. COALESCE(durationMinutes, 0) handles the nullable column
  // so games without a duration are treated as zero-length and are not silently
  // dropped from the overlap test.
  // NOTE: games.fieldNumber is a varchar column; the loop integer is converted
  // to a string for comparison (fieldKey = String(fieldNumber)). fieldRentals
  // .fieldNumber is an integer column, so that comparison stays numeric.
  const gameRows = await db
    .select({
      fieldNumber: games.fieldNumber,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
    })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        inArray(games.status, ["scheduled", "in_progress"]),
        lt(games.scheduledAt, dayEnd),
        gt(
          sql`${games.scheduledAt} + (COALESCE(${games.durationMinutes}, 0) * interval '1 minute')`,
          sql`${dayStart.toISOString()}::timestamptz`,
        ),
      ),
    );

  // Confirmed + non-expired pending_payment rentals overlapping the day.
  // status and paymentExpiresAt are used only in the WHERE clause below;
  // they are not needed in the select projection.
  const now = new Date();
  const rentalRows = await db
    .select({
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
    })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        lt(fieldRentals.startsAt, dayEnd),
        gt(fieldRentals.endsAt, dayStart),
        or(
          eq(fieldRentals.status, "confirmed"),
          and(
            eq(fieldRentals.status, "pending_payment"),
            or(
              isNull(fieldRentals.paymentExpiresAt),
              gte(fieldRentals.paymentExpiresAt, now),
            ),
          ),
        ),
      ),
    );

  const fields: FieldAvailability[] = [];
  for (let fieldNumber = 1; fieldNumber <= fieldCount; fieldNumber++) {
    const fieldKey = String(fieldNumber);
    const busy: TimeBlock[] = [];
    for (const g of gameRows) {
      // games.fieldNumber is varchar (see comment above); compare as string.
      if ((g.fieldNumber ?? "1") !== fieldKey) continue;
      busy.push({
        startsAt: g.scheduledAt,
        endsAt: new Date(
          g.scheduledAt.getTime() + (g.durationMinutes ?? 0) * 60_000,
        ),
      });
    }
    for (const r of rentalRows) {
      if (r.fieldNumber !== fieldNumber) continue;
      busy.push({ startsAt: r.startsAt, endsAt: r.endsAt });
    }
    fields.push({
      fieldNumber,
      free: subtractBusyBlocks(windowStart, windowEnd, busy),
    });
  }

  return { venueName: venue.name, fields };
}
