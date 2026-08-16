/**
 * Non-blocking soft holds for draft block quotes.
 *
 * These deliberately do NOT live in the field-time ledger: assertNoBlockConflict
 * treats every unexpired resource_blocks row as a hard conflict, so a marker
 * there would block competing quotes, the opposite of the intent. Markers are
 * read for display only, so an admin building a competing block can see
 * "also quoted to X".
 */
import { and, eq, gt, lt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  fieldRentalBlocks,
  fieldRentalBlockQuoteSlots,
} from "@/lib/db/schema/field-rental-blocks";

export interface MarkerSlot {
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
}

const slotKey = (venueId: string, startsAt: Date) => `${venueId}|${startsAt.toISOString()}`;

export async function replaceQuoteMarkers(
  blockId: string,
  slots: MarkerSlot[],
  ttlDays: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 3_600_000);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, blockId));
    if (slots.length === 0) return;
    await tx.insert(fieldRentalBlockQuoteSlots).values(
      slots.map((s) => ({
        blockId,
        venueId: s.venueId,
        fieldNumber: s.fieldNumber,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        expiresAt,
      })),
    );
  });
}

export async function clearQuoteMarkers(blockId: string): Promise<void> {
  await getDb()
    .delete(fieldRentalBlockQuoteSlots)
    .where(eq(fieldRentalBlockQuoteSlots.blockId, blockId));
}

export async function findCompetingQuotes(
  slots: MarkerSlot[],
  excludeBlockId?: string,
): Promise<Map<string, { blockId: string; label: string; quotedAt: Date }>> {
  const out = new Map<string, { blockId: string; label: string; quotedAt: Date }>();
  if (slots.length === 0) return out;

  const venueIds = [...new Set(slots.map((s) => s.venueId))];
  const earliest = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
  const latest = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));

  const rows = await getDb()
    .select({
      blockId: fieldRentalBlockQuoteSlots.blockId,
      venueId: fieldRentalBlockQuoteSlots.venueId,
      startsAt: fieldRentalBlockQuoteSlots.startsAt,
      endsAt: fieldRentalBlockQuoteSlots.endsAt,
      label: fieldRentalBlocks.label,
      quotedAt: fieldRentalBlocks.updatedAt,
    })
    .from(fieldRentalBlockQuoteSlots)
    .innerJoin(fieldRentalBlocks, eq(fieldRentalBlocks.id, fieldRentalBlockQuoteSlots.blockId))
    .where(
      and(
        inArray(fieldRentalBlockQuoteSlots.venueId, venueIds),
        gt(fieldRentalBlockQuoteSlots.expiresAt, new Date()),
        lt(fieldRentalBlockQuoteSlots.startsAt, latest),
        gt(fieldRentalBlockQuoteSlots.endsAt, earliest),
        eq(fieldRentalBlocks.status, "draft"),
      ),
    );

  for (const slot of slots) {
    const hit = rows.find(
      (r) =>
        r.venueId === slot.venueId &&
        r.blockId !== excludeBlockId &&
        r.startsAt < slot.endsAt &&
        r.endsAt > slot.startsAt,
    );
    if (hit) {
      out.set(slotKey(slot.venueId, slot.startsAt), {
        blockId: hit.blockId,
        label: hit.label,
        quotedAt: hit.quotedAt,
      });
    }
  }
  return out;
}

/**
 * Delete every marker past its TTL. The table is indexed on (venue_id,
 * starts_at) and (block_id), so this is a sequential scan; at the scale of
 * draft quotes that is fine, and the sweep runs on a cron rather than a
 * request path.
 */
export async function purgeExpiredQuoteMarkers(): Promise<{ purged: number }> {
  const rows = await getDb()
    .delete(fieldRentalBlockQuoteSlots)
    .where(lt(fieldRentalBlockQuoteSlots.expiresAt, new Date()))
    .returning({ id: fieldRentalBlockQuoteSlots.id });
  return { purged: rows.length };
}
