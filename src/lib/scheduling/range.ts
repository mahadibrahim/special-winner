/**
 * Range ledger read for the admin rental calendar.
 *
 * `getBlocksForVenueDay` (src/lib/scheduling/blocks.ts) answers "what is on
 * this venue today". The calendar asks a wider question: "is Tuesday 8pm free
 * all winter, across every field of every rental venue at this location, and
 * who else has asked for it". Same shape, wider window, several venues, one
 * pass each for the ledger and the soft quote holds.
 *
 * Both reads are READ-ONLY. Nothing here sweeps expired rows: the freshness
 * rule is applied as a filter (`expires_at IS NULL OR expires_at > now`),
 * exactly as `findLedgerConflicts` does, so the calendar never mutates the
 * ledger it is drawing.
 *
 * Sub-field resources (halves) carry their parent's `field_number`, so mapping
 * `venue_resources.field_number` straight through puts a booked half on the
 * same strip as its full field - which is what an admin needs to see.
 */
import { and, eq, gt, inArray, lt, or, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { resourceBlocks, venueResources, type BlockSource } from "@/lib/db/schema/scheduling";
import {
  fieldRentalBlocks,
  fieldRentalBlockQuoteSlots,
} from "@/lib/db/schema/field-rental-blocks";

export interface RangeBusyBlock {
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  sourceType: BlockSource;
  sourceId: string | null;
  label: string;
}

export interface RangeQuoteMarker {
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  blockId: string;
  label: string;
}

/**
 * Every unexpired ledger claim overlapping [fromUtc, toUtc) on the given
 * venues: confirmed rentals, scheduled games, drop-ins, external partner
 * bookings and internal reserves (maintenance rows with a null sourceId).
 */
export async function getBusyBlocksForVenuesRange(
  venueIds: string[],
  fromUtc: Date,
  toUtc: Date,
): Promise<RangeBusyBlock[]> {
  // An empty inArray generates invalid SQL, and there is nothing to ask anyway.
  if (venueIds.length === 0) return [];

  const now = new Date();
  const rows = await getDb()
    .select({
      venueId: venueResources.venueId,
      fieldNumber: venueResources.fieldNumber,
      startsAt: resourceBlocks.startsAt,
      endsAt: resourceBlocks.endsAt,
      sourceType: resourceBlocks.sourceType,
      sourceId: resourceBlocks.sourceId,
      label: resourceBlocks.label,
    })
    .from(resourceBlocks)
    .innerJoin(venueResources, eq(venueResources.id, resourceBlocks.resourceId))
    .where(
      and(
        inArray(venueResources.venueId, venueIds),
        lt(resourceBlocks.startsAt, toUtc),
        gt(resourceBlocks.endsAt, fromUtc),
        // Abandoned checkout holds are free time, exactly as
        // assertNoBlockConflict judges them.
        or(isNull(resourceBlocks.expiresAt), gt(resourceBlocks.expiresAt, now)),
      ),
    );

  return rows.map((r) => ({
    venueId: r.venueId,
    fieldNumber: r.fieldNumber,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    label: r.label,
  }));
}

/**
 * Live soft holds from draft block quotes overlapping the window. These are
 * not ledger rows (see quote-markers.ts for why) but they belong in the same
 * picture: "also quoted to X" is the contention an admin needs before quoting
 * the same winter slot twice.
 *
 * `purgeExpiredQuoteMarkers` runs hourly on the cron, but the expiry filter
 * stays here for correctness between sweeps.
 */
export async function getQuoteMarkersForVenuesRange(
  venueIds: string[],
  fromUtc: Date,
  toUtc: Date,
): Promise<RangeQuoteMarker[]> {
  if (venueIds.length === 0) return [];

  const rows = await getDb()
    .select({
      venueId: fieldRentalBlockQuoteSlots.venueId,
      fieldNumber: fieldRentalBlockQuoteSlots.fieldNumber,
      startsAt: fieldRentalBlockQuoteSlots.startsAt,
      endsAt: fieldRentalBlockQuoteSlots.endsAt,
      blockId: fieldRentalBlockQuoteSlots.blockId,
      label: fieldRentalBlocks.label,
    })
    .from(fieldRentalBlockQuoteSlots)
    .innerJoin(
      fieldRentalBlocks,
      eq(fieldRentalBlocks.id, fieldRentalBlockQuoteSlots.blockId),
    )
    .where(
      and(
        inArray(fieldRentalBlockQuoteSlots.venueId, venueIds),
        lt(fieldRentalBlockQuoteSlots.startsAt, toUtc),
        gt(fieldRentalBlockQuoteSlots.endsAt, fromUtc),
        gt(fieldRentalBlockQuoteSlots.expiresAt, new Date()),
        // A marker only means anything while its block is still a draft.
        eq(fieldRentalBlocks.status, "draft"),
      ),
    );

  return rows;
}
