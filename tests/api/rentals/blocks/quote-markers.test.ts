/**
 * Integration: quote markers are visible for display but never block.
 * Seeds rows directly via getDb(); no HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalBlocks, fieldRentalBlockQuoteSlots } from "@/lib/db/schema/field-rental-blocks";
import {
  replaceQuoteMarkers, clearQuoteMarkers, findCompetingQuotes, purgeExpiredQuoteMarkers,
} from "@/lib/rentals/blocks/quote-markers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID, resolveE2ELocationId } from "@/lib/db/seeds/seed-e2e-tests";

const START = new Date(Date.UTC(2039, 2, 1, 1));
const END = new Date(Date.UTC(2039, 2, 1, 2));
const slot = { venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END };
const created: string[] = [];

let locationId: string;

async function makeBlock(label: string) {
  const [b] = await getDb()
    .insert(fieldRentalBlocks)
    .values({
      organizationId: E2E_ORG_ID,
      locationId,
      label,
      renterName: label,
      status: "draft",
    })
    .returning();
  created.push(b.id);
  return b.id;
}

beforeAll(async () => {
  locationId = await resolveE2ELocationId();
});

afterAll(async () => {
  if (created.length) {
    await getDb().delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, created));
  }
});

describe("quote markers", () => {
  it("writes one marker per slot with the configured TTL", async () => {
    const id = await makeBlock("Marker A");
    await replaceQuoteMarkers(id, [slot], 14);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(1);
    const ttlDays = (rows[0].expiresAt.getTime() - Date.now()) / (24 * 3_600_000);
    expect(ttlDays).toBeGreaterThan(13.9);
    expect(ttlDays).toBeLessThan(14.1);
  });

  it("replaces rather than appends on re-save", async () => {
    const id = await makeBlock("Marker B");
    await replaceQuoteMarkers(id, [slot, { ...slot, startsAt: END, endsAt: new Date(END.getTime() + 3_600_000) }], 14);
    await replaceQuoteMarkers(id, [slot], 14);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(1);
  });

  it("surfaces a competing quote on the same slot, excluding the caller's own", async () => {
    const mine = await makeBlock("Marker Mine");
    const theirs = await makeBlock("Ohio Elite 03B");
    await replaceQuoteMarkers(mine, [slot], 14);
    await replaceQuoteMarkers(theirs, [slot], 14);

    const found = await findCompetingQuotes([slot], mine);
    const hit = found.get(`${slot.venueId}|${START.toISOString()}`);
    expect(hit?.label).toBe("Ohio Elite 03B");

    const unfiltered = await findCompetingQuotes([slot]);
    expect(unfiltered.size).toBe(1); // one slot key, whichever block won the pick
  });

  it("ignores expired markers", async () => {
    // Isolated slot: earlier cases leave LIVE markers on `slot`, so asserting
    // zero against that slot would fail on their rows, not on expiry.
    const lonely = {
      ...slot,
      startsAt: new Date(Date.UTC(2039, 5, 1, 1)),
      endsAt: new Date(Date.UTC(2039, 5, 1, 2)),
    };
    const id = await makeBlock("Marker Expired");
    await replaceQuoteMarkers(id, [lonely], 14);
    expect((await findCompetingQuotes([lonely])).size).toBe(1);

    await getDb()
      .update(fieldRentalBlockQuoteSlots)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect((await findCompetingQuotes([lonely])).size).toBe(0);
  });

  it("clears markers for a block", async () => {
    const id = await makeBlock("Marker Clear");
    await replaceQuoteMarkers(id, [slot], 14);
    await clearQuoteMarkers(id);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(0);
  });

  it("purges expired markers", async () => {
    const id = await makeBlock("Marker Purge");
    await replaceQuoteMarkers(id, [slot], 14);
    await getDb()
      .update(fieldRentalBlockQuoteSlots)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    const { purged } = await purgeExpiredQuoteMarkers();
    expect(purged).toBeGreaterThanOrEqual(1);
  });
});
