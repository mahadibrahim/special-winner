/**
 * Integration: internal reserve mode.
 *
 * Reserving fences prime inventory for facility-hosted programming BEFORE
 * anyone gets quoted, so it writes manual ledger blocks rather than rentals:
 * no block row, no session rows, and the builder then surfaces those slots as
 * conflicts carrying the reserve's label.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { resourceBlocks } from "@/lib/db/schema/scheduling";
import { getAdminCookie, getParentCookie, apiFetch } from "../../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, resolveE2ELocationId } from "@/lib/db/seeds/seed-e2e-tests";

let admin: string;
let parent: string;
let locationId: string;

const LABEL = `Winter league reserve ${Math.random().toString(36).slice(2, 8)}`;
// Four Tuesdays, far enough out that no fixture or other suite competes.
const pattern = {
  timeZone: "America/New_York",
  firstDate: "2044-01-05",
  lastDate: "2044-01-26",
  days: [
    { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [E2E_RENTAL_VENUE_ID] },
  ],
};
const RANGE_START = new Date("2044-01-01T00:00:00Z");
const RANGE_END = new Date("2044-02-01T00:00:00Z");

const body = (over: Record<string, unknown> = {}) => ({
  locationId,
  brand: "soccerone",
  label: LABEL,
  pattern,
  excludedKeys: [],
  sessionOverrides: {},
  extraSessions: [],
  mode: "internal_reserve",
  ...over,
});

beforeAll(async () => {
  admin = await getAdminCookie();
  parent = await getParentCookie();
  locationId = await resolveE2ELocationId();
});

afterAll(async () => {
  const db = getDb();
  await db.delete(resourceBlocks).where(eq(resourceBlocks.label, LABEL));
  const strays = await db
    .select({ id: fieldRentals.id })
    .from(fieldRentals)
    .where(
      and(gte(fieldRentals.startsAt, RANGE_START), lte(fieldRentals.startsAt, RANGE_END)),
    );
  if (strays.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.id, strays.map((s) => s.id)));
  }
  await db.delete(fieldRentalBlocks).where(eq(fieldRentalBlocks.label, LABEL));
});

describe("POST /api/admin/rentals/blocks (internal_reserve)", () => {
  it("writes manual ledger blocks and no rental rows", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reservedCount).toBe(4);

    const db = getDb();
    const blockRows = await db
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.label, LABEL));
    expect(blockRows).toHaveLength(0);

    const rentalRows = await db
      .select()
      .from(fieldRentals)
      .where(
        and(gte(fieldRentals.startsAt, RANGE_START), lte(fieldRentals.startsAt, RANGE_END)),
      );
    expect(rentalRows).toHaveLength(0);

    const ledger = await db
      .select()
      .from(resourceBlocks)
      .where(eq(resourceBlocks.label, LABEL));
    expect(ledger).toHaveLength(4);
    expect(ledger.every((b) => b.sourceType === "maintenance")).toBe(true);
    expect(ledger.every((b) => b.sourceId === null)).toBe(true);
  });

  it("makes those slots read as conflicts in the builder", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks/generate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(
        body({
          mode: "draft",
          renterName: "Competing Renter",
          discount: null,
          depositPct: 25,
        }),
      ),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(4);
    expect(
      json.sessions.every((s: { conflict: { reason: string } | null }) =>
        s.conflict?.reason.includes(LABEL),
      ),
    ).toBe(true);
  });

  it("rejects a non-admin", async () => {
    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: parent },
      body: JSON.stringify(body()),
    });
    expect([401, 403]).toContain(res.status);
  });
});
