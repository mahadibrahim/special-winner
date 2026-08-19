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
// Four Tuesdays. NOTE: this window (2044-01) is also used by
// calendar-range.test.ts and calendar-endpoint.test.ts, which run in
// parallel vitest workers and seed their own fieldRentals rows in the same
// range — so any assertion/cleanup here must be scoped to rows this suite
// itself could have created, never a bare window-wide count/delete.
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
// Marks "this suite's run" for scoping the safety-net cleanup below.
const SUITE_STARTED_AT = new Date();

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
  // internal_reserve mode writes no fieldRentals rows, so this suite should
  // never leave any behind — but as a safety net (in case the endpoint
  // regresses), scope the stray-delete to rows this suite itself could have
  // written: our venue, our window, created no earlier than this suite
  // started. A bare window-wide delete here previously destroyed sibling
  // suites' (calendar-range.test.ts, calendar-endpoint.test.ts) fixtures
  // mid-run since they share the 2044-01 window and run in parallel.
  const strays = await db
    .select({ id: fieldRentals.id })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, E2E_RENTAL_VENUE_ID),
        gte(fieldRentals.startsAt, RANGE_START),
        lte(fieldRentals.startsAt, RANGE_END),
        gte(fieldRentals.createdAt, SUITE_STARTED_AT),
      ),
    );
  if (strays.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.id, strays.map((s) => s.id)));
  }
  await db.delete(fieldRentalBlocks).where(eq(fieldRentalBlocks.label, LABEL));
});

describe("POST /api/admin/rentals/blocks (internal_reserve)", () => {
  it("writes manual ledger blocks and no rental rows", async () => {
    const db = getDb();
    // Sibling suites (calendar-range.test.ts, calendar-endpoint.test.ts)
    // seed their own fieldRentals rows in this same 2044-01 window and run
    // concurrently as separate vitest files, so a bare "zero rows in the
    // window" count races them. Instead, snapshot which rows already exist
    // for our venue before the POST, then assert the POST added none of its
    // own — attributable to this suite's own write, not a global count.
    const beforeIds = new Set(
      (
        await db
          .select({ id: fieldRentals.id })
          .from(fieldRentals)
          .where(
            and(
              eq(fieldRentals.venueId, E2E_RENTAL_VENUE_ID),
              gte(fieldRentals.startsAt, RANGE_START),
              lte(fieldRentals.startsAt, RANGE_END),
            ),
          )
      ).map((r) => r.id),
    );

    const res = await apiFetch("/api/admin/rentals/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reservedCount).toBe(4);

    const blockRows = await db
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.label, LABEL));
    expect(blockRows).toHaveLength(0);

    const afterRows = await db
      .select({ id: fieldRentals.id })
      .from(fieldRentals)
      .where(
        and(
          eq(fieldRentals.venueId, E2E_RENTAL_VENUE_ID),
          gte(fieldRentals.startsAt, RANGE_START),
          lte(fieldRentals.startsAt, RANGE_END),
        ),
      );
    const newRows = afterRows.filter((r) => !beforeIds.has(r.id));
    expect(newRows).toHaveLength(0);

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
