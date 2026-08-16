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

// Each case takes its OWN slot. findCompetingQuotes returns whichever marker
// it finds first on a slot, so cases sharing one slot made the competing-quote
// assertion pick an earlier case's block ("expected 'Marker A' to be
// 'Ohio Elite 03B'"). Markers also outlive a case, so a shared slot leaks state
// forward. The random day base keeps concurrent runs — and rows left behind by
// an earlier run on the shared CI database — off the same slot.
const DAY_BASE = 1 + Math.floor(Math.random() * 20_000);
let slotCursor = 0;
function nextSlot() {
  const startsAt = new Date(Date.UTC(2039, 0, 1, 1) + (DAY_BASE + slotCursor++) * 86_400_000);
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: 1,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3_600_000),
  };
}
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
    const slot = nextSlot();
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
    const slot = nextSlot();
    const adjacent = {
      ...slot,
      startsAt: slot.endsAt,
      endsAt: new Date(slot.endsAt.getTime() + 3_600_000),
    };
    const id = await makeBlock("Marker B");
    await replaceQuoteMarkers(id, [slot, adjacent], 14);
    await replaceQuoteMarkers(id, [slot], 14);
    const rows = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect(rows).toHaveLength(1);
  });

  it("surfaces a competing quote on the same slot, excluding the caller's own", async () => {
    const slot = nextSlot();
    const mine = await makeBlock("Marker Mine");
    const theirs = await makeBlock("Ohio Elite 03B");
    await replaceQuoteMarkers(mine, [slot], 14);
    await replaceQuoteMarkers(theirs, [slot], 14);

    // Only `theirs` can be returned: the slot is this case's alone, and `mine`
    // is excluded. Sharing a slot across cases made this pick an earlier
    // case's block instead.
    const found = await findCompetingQuotes([slot], mine);
    const hit = found.get(`${slot.venueId}|${slot.startsAt.toISOString()}`);
    expect(hit?.label).toBe("Ohio Elite 03B");

    const unfiltered = await findCompetingQuotes([slot]);
    expect(unfiltered.size).toBe(1); // one slot key, whichever block won the pick
  });

  it("ignores expired markers", async () => {
    const slot = nextSlot();
    const id = await makeBlock("Marker Expired");
    await replaceQuoteMarkers(id, [slot], 14);
    expect((await findCompetingQuotes([slot])).size).toBe(1);

    await getDb()
      .update(fieldRentalBlockQuoteSlots)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fieldRentalBlockQuoteSlots.blockId, id));
    expect((await findCompetingQuotes([slot])).size).toBe(0);
  });

  it("clears markers for a block", async () => {
    const slot = nextSlot();
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
    const slot = nextSlot();
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
