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
import { and, eq, gte, lt, inArray, isNull, or, gt } from "drizzle-orm";
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

  // Games on this venue overlapping the day. games.endsAt is derived from
  // scheduledAt + durationMinutes.
  // NOTE: games.fieldNumber is varchar in the schema; comparison is done
  // after fetching by converting the loop integer to string.
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
      ),
    );

  // Confirmed + non-expired pending_payment rentals overlapping the day.
  const now = new Date();
  const rentalRows = await db
    .select({
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentExpiresAt: fieldRentals.paymentExpiresAt,
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
      // games.fieldNumber is varchar; default to "1" when null.
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
