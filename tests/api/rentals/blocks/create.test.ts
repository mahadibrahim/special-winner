/**
 * Integration: createRentalBlock commits a block + its sessions atomically,
 * and rejects the whole build when any session conflicts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks, fieldRentalBlockQuoteSlots } from "@/lib/db/schema/field-rental-blocks";
import { createRentalBlock, resolveSessionList, type CreateBlockInput } from "@/lib/rentals/blocks/create";
import { generateBlockSessions } from "@/lib/rentals/blocks/generate";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
  resolveE2ELocationId,
  resolveE2EAdminUserId,
} from "@/lib/db/seeds/seed-e2e-tests";

const TZ = "America/New_York";
const createdBlocks: string[] = [];
const createdRentals: string[] = [];

let E2E_LOCATION_ID: string;
let E2E_ADMIN_USER_ID: string;

// Far-future Tuesdays so nothing in seeded data collides.
const pattern = {
  timeZone: TZ,
  firstDate: "2041-01-08",
  lastDate: "2041-01-29",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] }],
};

function input(overrides: Partial<CreateBlockInput> = {}): CreateBlockInput {
  return {
    organizationId: E2E_ORG_ID,
    locationId: E2E_LOCATION_ID,
    brand: "soccerone" as const,
    label: `Block Test ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Block Tester",
    renterEmail: "block-tester@test.aspiresports.com",
    renterPhone: null,
    partySize: 12,
    purpose: "team practice",
    notes: null,
    pattern,
    excludedKeys: [],
    sessionOverrides: {},
    extraSessions: [],
    discount: { kind: "percent" as const, value: 10 },
    depositPct: 25,
    rateCard: { balanceDueLeadDays: 30, blockHoldHours: 72, quoteMarkerTtlDays: 14 },
    pricingContext: {
      brand: "soccerone" as const,
      timeZone: TZ,
      venueHourlyRateCents: { [E2E_RENTAL_VENUE_ID]: null },
      defaultHourlyRateCents: 8000,
    },
    mode: "send_deposit" as const,
    offlinePaymentMethod: null,
    createdByUserId: E2E_ADMIN_USER_ID,
    ...overrides,
  };
}

beforeAll(async () => {
  E2E_LOCATION_ID = await resolveE2ELocationId();
  E2E_ADMIN_USER_ID = await resolveE2EAdminUserId();
});

afterAll(async () => {
  const db = getDb();
  if (createdRentals.length) await db.delete(fieldRentals).where(inArray(fieldRentals.id, createdRentals));
  if (createdBlocks.length) await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, createdBlocks));
});

async function commit(over: Partial<CreateBlockInput> = {}) {
  const res = await createRentalBlock(input(over));
  if (res.ok) {
    createdBlocks.push(res.blockId);
    createdRentals.push(...res.sessionIds);
  }
  return res;
}

describe("resolveSessionList", () => {
  it("drops excluded keys and applies per-row overrides", () => {
    const all = generateBlockSessions(pattern);
    const list = resolveSessionList(
      input({ excludedKeys: [all[1].key], sessionOverrides: { [all[2].key]: { startMinute: 1260 } } }),
    );
    expect(list).toHaveLength(all.length - 1);
    expect(list.find((s) => s.date === all[2].date)!.startMinute).toBe(1260);
  });
});

describe("createRentalBlock", () => {
  it("send_deposit creates pending_payment sessions and an awaiting_deposit block", async () => {
    const res = await commit();
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("awaiting_deposit");
    expect(block.subtotalCents).toBe(4 * 26000);      // 4 winter-evening Tuesdays
    expect(block.totalCents).toBe(93600);              // −10%
    expect(block.depositDueCents).toBe(23400);         // 25%
    expect(block.balanceDueCents).toBe(70200);
    expect(block.depositExpiresAt).toBeTruthy();
    expect(block.balanceDueAt).toBeTruthy();

    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.status === "pending_payment")).toBe(true);
    expect(sessions.every((s) => s.paymentStatus === "unpaid" && s.amountPaidCents === 0)).toBe(true);
    expect(sessions.every((s) => s.brand === "soccerone")).toBe(true);
    expect(sessions.every((s) => s.paymentExpiresAt !== null)).toBe(true);
    expect(sessions.reduce((a, s) => a + s.amountDueCents, 0)).toBe(block.totalCents);
  });

  it("paid_offline confirms the block and every session immediately", async () => {
    const res = await commit({
      mode: "paid_offline",
      offlinePaymentMethod: "cash",
      pattern: { ...pattern, firstDate: "2041-02-05", lastDate: "2041-02-26" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("active");
    expect(block.offlinePaymentMethod).toBe("cash");
    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions.every((s) => s.status === "confirmed" && s.paymentStatus === "paid")).toBe(true);
  });

  it("draft creates the block and quote markers but no sessions", async () => {
    const res = await commit({
      mode: "draft",
      pattern: { ...pattern, firstDate: "2041-03-05", lastDate: "2041-03-26" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [block] = await getDb().select().from(fieldRentalBlocks).where(eq(fieldRentalBlocks.id, res.blockId));
    expect(block.status).toBe("draft");
    expect(block.pattern).toBeTruthy();
    const sessions = await getDb().select().from(fieldRentals).where(eq(fieldRentals.blockId, res.blockId));
    expect(sessions).toHaveLength(0);
    const markers = await getDb()
      .select()
      .from(fieldRentalBlockQuoteSlots)
      .where(eq(fieldRentalBlockQuoteSlots.blockId, res.blockId));
    expect(markers).toHaveLength(4);
  });

  it("rejects the whole build when a session conflicts, creating nothing", async () => {
    const p = { ...pattern, firstDate: "2041-04-02", lastDate: "2041-04-23" };
    const first = await commit({ pattern: p });
    expect(first.ok).toBe(true);

    const before = await getDb().select().from(fieldRentalBlocks);
    const second = await createRentalBlock(input({ pattern: p }));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.conflicts.length).toBeGreaterThan(0);

    const after = await getDb().select().from(fieldRentalBlocks);
    expect(after.length).toBe(before.length); // nothing committed
  });

  it("rejects an empty session list", async () => {
    const res = await createRentalBlock(
      input({ pattern: { ...pattern, days: [] } }),
    );
    expect(res.ok).toBe(false);
  });
});
