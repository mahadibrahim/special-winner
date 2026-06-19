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
import { resourceBlocks, venueResources, type BlockSource } from "@/lib/db/schema/scheduling";
import { expandFamily } from "@/lib/scheduling/blocks";
import { subtractBusyBlocks, type TimeBlock } from "./overlap";

/**
 * Maps the resource_blocks.source_type discriminator to a human-readable
 * label shown to renters in the booking calendar.
 */
export function blockReasonLabel(kind: string): string {
  switch (kind as BlockSource) {
    case "rental":
      return "Rented";
    case "drop_in":
      return "Pickup Game";
    case "game":
      return "League Game";
    case "maintenance":
      return "Closed";
    case "external":
      return "Reserved";
    case "practice":
      return "Reserved";
    default:
      return "Unavailable";
  }
}

export interface BusyBlock {
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

export interface FieldAvailability {
  fieldNumber: number;
  free: TimeBlock[];
  busy: BusyBlock[];
}

export async function getVenueRentalAvailability(
  venueId: string,
  /** UTC instant for the org's local midnight (start of the calendar day in org tz). */
  dayStart: Date,
  /** UTC instant for the org's local 23:59:59.999 (end of the calendar day in org tz). */
  dayEnd: Date,
  /**
   * UTC instant for the org's local 00:00:00 — identical to dayStart, passed
   * explicitly so rentalOpenMinute/rentalCloseMinute (minutes of LOCAL day) are
   * anchored to the local midnight rather than UTC midnight. When omitted falls
   * back to dayStart (preserves backward-compatibility for callers that pass
   * pre-computed UTC day bounds).
   */
  localDayStartUtc: Date = dayStart,
): Promise<{ venueName: string; fields: FieldAvailability[] } | null> {
  const db = getDb();

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || !venue.rentalEnabled) return null;

  const fieldCount = venue.fieldCount ?? 1;

  // Venue rental window for the day, derived from the LOCAL day start so
  // rentalOpenMinute/rentalCloseMinute (minutes of local wall-clock day) land
  // at the correct UTC instants for the org's timezone. E.g. open=960 (4 PM
  // ET summer) → localDayStartUtc(04:00Z) + 960 min = 20:00Z = 4 PM ET.
  // Null open/close → full day bounds.
  const windowStart =
    venue.rentalOpenMinute != null
      ? new Date(localDayStartUtc.getTime() + venue.rentalOpenMinute * 60_000)
      : dayStart;
  const windowEnd =
    venue.rentalCloseMinute != null
      ? new Date(localDayStartUtc.getTime() + venue.rentalCloseMinute * 60_000)
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
            sourceType: resourceBlocks.sourceType,
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

  const blocksByResource = new Map<
    string,
    { startsAt: Date; endsAt: Date; sourceType: string }[]
  >();
  for (const b of blockRows) {
    const list = blocksByResource.get(b.resourceId) ?? [];
    list.push({ startsAt: b.startsAt, endsAt: b.endsAt, sourceType: b.sourceType });
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
      const rawBlocks = familyIds.flatMap(
        (id) => blocksByResource.get(id) ?? [],
      );
      const busyTimeBlocks: TimeBlock[] = rawBlocks.map((b) => ({
        startsAt: b.startsAt,
        endsAt: b.endsAt,
      }));
      const busyLabeled: BusyBlock[] = rawBlocks.map((b) => ({
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        reason: blockReasonLabel(b.sourceType),
      }));
      fields.push({
        fieldNumber: field.fieldNumber,
        free: subtractBusyBlocks(windowStart, windowEnd, busyTimeBlocks),
        busy: busyLabeled,
      });
    }
  } else {
    // No resource rows (legacy/test venue) — enumerate bare fields.
    for (let fieldNumber = 1; fieldNumber <= fieldCount; fieldNumber++) {
      fields.push({
        fieldNumber,
        free: subtractBusyBlocks(windowStart, windowEnd, []),
        busy: [],
      });
    }
  }

  return { venueName: venue.name, fields };
}
