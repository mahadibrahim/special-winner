/**
 * Integration: the range ledger read returns rentals, games, reserves and
 * quote markers for a set of venues over a window.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import {
  getBusyBlocksForVenuesRange,
  getQuoteMarkersForVenuesRange,
} from "@/lib/scheduling/range";
import { replaceQuoteMarkers } from "@/lib/rentals/blocks/quote-markers";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
  resolveE2ELocationId,
} from "@/lib/db/seeds/seed-e2e-tests";

const FROM = new Date(Date.UTC(2044, 0, 1));
const TO = new Date(Date.UTC(2044, 1, 1));
const START = new Date(Date.UTC(2044, 0, 13, 1)); // 2044-01-12 8pm ET
const END = new Date(Date.UTC(2044, 0, 13, 2));
const rentals: string[] = [];
const blocks: string[] = [];

let locationId: string;

beforeAll(async () => {
  locationId = await resolveE2ELocationId();
});

afterAll(async () => {
  const db = getDb();
  if (rentals.length) await db.delete(fieldRentals).where(inArray(fieldRentals.id, rentals));
  if (blocks.length) await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, blocks));
});

describe("getBusyBlocksForVenuesRange", () => {
  it("returns a confirmed rental inside the window with its label", async () => {
    const [r] = await getDb()
      .insert(fieldRentals)
      .values({
        organizationId: E2E_ORG_ID,
        venueId: E2E_RENTAL_VENUE_ID,
        fieldNumber: 1,
        startsAt: START,
        endsAt: END,
        status: "confirmed",
        source: "admin_created",
        paymentMethod: "cash",
        amountDueCents: 26000,
        renterName: "Range Tester",
      })
      .returning();
    rentals.push(r.id);
    await syncRentalBlock(r.id);

    const busy = await getBusyBlocksForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    const hit = busy.find((b) => b.sourceId === r.id);
    expect(hit).toBeTruthy();
    expect(hit!.sourceType).toBe("rental");
    expect(hit!.fieldNumber).toBe(1);
    expect(hit!.startsAt.toISOString()).toBe(START.toISOString());
  });

  it("excludes blocks entirely outside the window", async () => {
    const busy = await getBusyBlocksForVenuesRange(
      [E2E_RENTAL_VENUE_ID],
      new Date(Date.UTC(2044, 5, 1)),
      new Date(Date.UTC(2044, 5, 2)),
    );
    expect(busy.every((b) => !rentals.includes(b.sourceId ?? ""))).toBe(true);
  });

  it("returns an empty array for no venues", async () => {
    expect(await getBusyBlocksForVenuesRange([], FROM, TO)).toEqual([]);
  });
});

describe("getQuoteMarkersForVenuesRange", () => {
  it("returns unexpired draft markers with their block label", async () => {
    const [b] = await getDb()
      .insert(fieldRentalBlocks)
      .values({
        organizationId: E2E_ORG_ID,
        locationId,
        label: "Range Quote Team",
        renterName: "Range Quote Team",
        status: "draft",
      })
      .returning();
    blocks.push(b.id);
    await replaceQuoteMarkers(
      b.id,
      [{ venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END }],
      14,
    );

    const markers = await getQuoteMarkersForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    const hit = markers.find((m) => m.blockId === b.id);
    expect(hit?.label).toBe("Range Quote Team");
  });

  it("ignores expired markers", async () => {
    const id = blocks[blocks.length - 1];
    // Expire by rewriting with a negative TTL.
    await replaceQuoteMarkers(
      id,
      [{ venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 1, startsAt: START, endsAt: END }],
      -1,
    );
    const markers = await getQuoteMarkersForVenuesRange([E2E_RENTAL_VENUE_ID], FROM, TO);
    expect(markers.some((m) => m.blockId === id)).toBe(false);
  });

  it("returns an empty array for no venues", async () => {
    expect(await getQuoteMarkersForVenuesRange([], FROM, TO)).toEqual([]);
  });
});
