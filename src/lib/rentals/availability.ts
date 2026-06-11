/**
 * Computes free rental blocks for a venue on a given calendar date.
 *
 * Free = the venue's rental window (rentalOpenMinute..rentalCloseMinute)
 * minus the FIELD-TIME LEDGER's blocks for each field — games, drop-in
 * sessions, other rentals (confirmed + unexpired holds), external
 * partner bookings (Good Rec / email), and maintenance, all in one
 * subtraction. The ledger (resource_blocks) is the single source of
 * truth; see docs/superpowers/specs/2026-06-11-field-time-ledger-design.md.
 *
 * Field enumeration prefers venue_resources rows (created with the venue
 * and kept in lockstep with fieldCount); venues that somehow lack
 * resource rows fall back to a bare 1..fieldCount enumeration with no
 * busy blocks rather than erroring.
 */
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { resourceBlocks, venueResources } from "@/lib/db/schema/scheduling";
import { expandFamily } from "@/lib/scheduling/blocks";
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

  // The venue's resource tree (all rows — family expansion needs
  // children even when only top-level fields are rentable units).
  const resourceRows = await db
    .select({
      id: venueResources.id,
      fieldNumber: venueResources.fieldNumber,
      parentResourceId: venueResources.parentResourceId,
      active: venueResources.active,
    })
    .from(venueResources)
    .where(eq(venueResources.venueId, venueId));

  // Unexpired ledger blocks overlapping the day, across all the venue's
  // resources. One query; bucketing happens in memory (small sets).
  const resourceIds = resourceRows.map((r) => r.id);
  const now = new Date();
  const blockRows =
    resourceIds.length > 0
      ? await db
          .select({
            resourceId: resourceBlocks.resourceId,
            startsAt: resourceBlocks.startsAt,
            endsAt: resourceBlocks.endsAt,
          })
          .from(resourceBlocks)
          .where(
            and(
              inArray(resourceBlocks.resourceId, resourceIds),
              lt(resourceBlocks.startsAt, dayEnd),
              gt(resourceBlocks.endsAt, dayStart),
              or(
                isNull(resourceBlocks.expiresAt),
                gt(resourceBlocks.expiresAt, now),
              ),
            ),
          )
      : [];

  const blocksByResource = new Map<string, TimeBlock[]>();
  for (const b of blockRows) {
    const list = blocksByResource.get(b.resourceId) ?? [];
    list.push({ startsAt: b.startsAt, endsAt: b.endsAt });
    blocksByResource.set(b.resourceId, list);
  }

  const topLevel = resourceRows
    .filter((r) => r.parentResourceId === null && r.active)
    .sort((a, b) => a.fieldNumber - b.fieldNumber);

  const fields: FieldAvailability[] = [];
  if (topLevel.length > 0) {
    for (const field of topLevel) {
      // Busy = blocks on the field OR anything in its family (a booked
      // half blocks the full field for rental purposes).
      const familyIds = expandFamily(field.id, resourceRows);
      const busy: TimeBlock[] = familyIds.flatMap(
        (id) => blocksByResource.get(id) ?? [],
      );
      fields.push({
        fieldNumber: field.fieldNumber,
        free: subtractBusyBlocks(windowStart, windowEnd, busy),
      });
    }
  } else {
    // No resource rows (legacy/test venue) — enumerate bare fields.
    for (let fieldNumber = 1; fieldNumber <= fieldCount; fieldNumber++) {
      fields.push({
        fieldNumber,
        free: subtractBusyBlocks(windowStart, windowEnd, []),
      });
    }
  }

  return { venueName: venue.name, fields };
}
