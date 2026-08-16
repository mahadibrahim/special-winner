/**
 * Integration: block detail read, metadata edit, and cancellation.
 *
 * Blocks are seeded through createRentalBlock with mode "paid_offline" so the
 * block carries a real paid amount and the suggested refund is exercised
 * against a non-zero ceiling.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { createRentalBlock, type CreateBlockInput } from "@/lib/rentals/blocks/create";
import { getAdminCookie, getParentCookie, apiFetch } from "../../setup/test-helpers";
import {
  E2E_RENTAL_VENUE_ID,
  E2E_ORG_ID,
  resolveE2ELocationId,
  resolveE2EAdminUserId,
} from "@/lib/db/seeds/seed-e2e-tests";

const TZ = "America/New_York";
let admin: string;
let parent: string;
let locationId: string;
let adminUserId: string;

const createdBlocks: string[] = [];
const createdRentals: string[] = [];

// Far-future Tuesdays, in a year no other block suite uses.
function pattern(firstDate: string, lastDate: string) {
  return {
    timeZone: TZ,
    firstDate,
    lastDate,
    days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] }],
  };
}

function input(overrides: Partial<CreateBlockInput> = {}): CreateBlockInput {
  return {
    organizationId: E2E_ORG_ID,
    locationId,
    brand: "soccerone",
    label: `Detail Block ${Math.random().toString(36).slice(2, 8)}`,
    renterUserId: null,
    renterName: "Detail Tester",
    renterEmail: "detail-tester@test.aspiresports.com",
    renterPhone: null,
    partySize: 12,
    purpose: "team practice",
    notes: null,
    pattern: pattern("2043-01-06", "2043-01-27"),
    excludedKeys: [],
    sessionOverrides: {},
    extraSessions: [],
    discount: null,
    depositPct: 25,
    rateCard: { balanceDueLeadDays: 30, blockHoldHours: 72, quoteMarkerTtlDays: 14 },
    pricingContext: {
      brand: "soccerone",
      timeZone: TZ,
      venueHourlyRateCents: { [E2E_RENTAL_VENUE_ID]: null },
      defaultHourlyRateCents: 8000,
    },
    mode: "paid_offline",
    offlinePaymentMethod: "cash",
    createdByUserId: adminUserId,
    ...overrides,
  };
}

async function seedBlock(overrides: Partial<CreateBlockInput> = {}) {
  const res = await createRentalBlock(input(overrides));
  if (!res.ok) throw new Error(`seed block failed: ${res.error}`);
  createdBlocks.push(res.blockId);
  createdRentals.push(...res.sessionIds);
  return res;
}

beforeAll(async () => {
  admin = await getAdminCookie();
  parent = await getParentCookie();
  locationId = await resolveE2ELocationId();
  adminUserId = await resolveE2EAdminUserId();
});

afterAll(async () => {
  const db = getDb();
  if (createdRentals.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.id, createdRentals));
  }
  if (createdBlocks.length) {
    await db.delete(fieldRentalBlocks).where(inArray(fieldRentalBlocks.id, createdBlocks));
  }
});

describe("GET /api/admin/rentals/blocks/:id", () => {
  it("returns the block with its sessions ordered by start time", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-02-03", "2043-02-24") });
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      headers: { Cookie: admin },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.block.id).toBe(seeded.blockId);
    expect(json.sessions).toHaveLength(4);
    expect(json.sessions[0].venueName).toBeTruthy();
    const starts = json.sessions.map((s: { startsAt: string }) => s.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });

  it("404s on a block id that is not this org's", async () => {
    const res = await apiFetch(
      "/api/admin/rentals/blocks/00000000-0000-0000-0000-000000000000",
      { headers: { Cookie: admin } },
    );
    expect([403, 404]).toContain(res.status);
  });

  it("rejects a non-admin", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-03-03", "2043-03-24") });
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      headers: { Cookie: parent },
    });
    expect([401, 403]).toContain(res.status);
  });
});

describe("PATCH /api/admin/rentals/blocks/:id", () => {
  it("persists a notes edit", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-04-07", "2043-04-28") });
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify({ notes: "Called the coach, invoice mailed." }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.block.notes).toBe("Called the coach, invoice mailed.");

    const [row] = await getDb()
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.id, seeded.blockId));
    expect(row.notes).toBe("Called the coach, invoice mailed.");
  });

  it("cancelRemainingFrom cancels only the sessions at or after the instant", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-05-05", "2043-05-26") });
    const sessions = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.blockId, seeded.blockId))
      .orderBy(fieldRentals.startsAt);
    expect(sessions).toHaveLength(4);

    const cutoff = sessions[2].startsAt;
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify({ cancelRemainingFrom: cutoff.toISOString() }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancelledSessionIds).toHaveLength(2);

    const expectedRefund = sessions[2].amountDueCents + sessions[3].amountDueCents;
    expect(json.suggestedRefundCents).toBe(expectedRefund);
    expect(json.suggestedRefundCents % 100).toBe(0);

    const after = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.blockId, seeded.blockId))
      .orderBy(fieldRentals.startsAt);
    expect(after.slice(0, 2).every((s) => s.status === "confirmed")).toBe(true);
    expect(after.slice(2).every((s) => s.status === "cancelled")).toBe(true);
  });

  it("cancel: true cancels the block and every session", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-06-02", "2043-06-23") });
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify({ cancel: true }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.block.status).toBe("cancelled");
    expect(json.cancelledSessionIds).toHaveLength(4);

    const after = await getDb()
      .select()
      .from(fieldRentals)
      .where(eq(fieldRentals.blockId, seeded.blockId));
    expect(after.every((s) => s.status === "cancelled")).toBe(true);
  });

  it("rejects a non-admin", async () => {
    const seeded = await seedBlock({ pattern: pattern("2043-07-07", "2043-07-28") });
    const res = await apiFetch(`/api/admin/rentals/blocks/${seeded.blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify({ notes: "nope" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
