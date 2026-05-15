/**
 * Conflict detection integration tests for POST /api/rentals/bookings.
 *
 * Seeds a confirmed rental row directly (no Stripe dependency), then
 * POSTs an overlapping booking and asserts a 409 conflict response.
 * Also asserts a non-overlapping booking on the same field succeeds.
 *
 * Slots are unique per test run via a Date.now()-derived day offset so
 * re-runs against the shared staging DB don't collide with prior rows.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getParentCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";

// A distinct calendar DAY per test run, far in the future, at a fixed
// within-window hour. Date.now() spread across millions of distinct days
// means consecutive runs (even seconds apart) never reuse a slot.
const RUN_DAY_OFFSET = Date.now() % 3_000_000;
const DAY_MS = 86_400_000;
const RUN_BASE_UTC = Date.UTC(2030, 0, 1) + RUN_DAY_OFFSET * DAY_MS;

/**
 * Build a slot inside the venue rental window (8am-10pm UTC). `hourOfDay`
 * stays between 9 and 19 so a 1-2h booking ends by 21:00.
 */
function slot(hourOfDay: number, durationHours: number) {
  const start = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// Uses field 2 to avoid clashing with bookings.test.ts (field 1).
const FIELD = 2;

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: FIELD,
    partySize: 2,
    waiverAccepted: true,
    waiverName: "Conflict Tester",
    ...overrides,
  };
}

describe("rental booking conflict detection", () => {
  let parentCookie: string;

  beforeAll(async () => {
    parentCookie = await getParentCookie();

    // Seed a confirmed rental directly — no Stripe dependency.
    // This is the row the conflict test POSTs against.
    // slot: hour 10, 2h → 10:00–12:00 on the run-unique day.
    const db = getDb();
    const seedSlot = slot(10, 2);
    await db.insert(fieldRentals).values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: FIELD,
      startsAt: new Date(seedSlot.startsAt),
      endsAt: new Date(seedSlot.endsAt),
      status: "confirmed",
      source: "admin_created",
      renterName: "Conflict Seed",
      paymentMethod: "comp",
      amountDueCents: 0,
      paymentStatus: "paid",
    });
  });

  it("rejects an overlapping booking on the same field with 409", async () => {
    // POST: field 2, hour 11, 2h (11:00–13:00) — overlaps seeded row (10:00–12:00)
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify(
        bookingBody(slot(11, 2)),
      ),
    });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("accepts a non-overlapping booking on the same field with 200", async () => {
    // POST: field 2, hour 15, 1h (15:00–16:00) — does NOT overlap seeded row (10:00–12:00)
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify(
        bookingBody(slot(15, 1)),
      ),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("paymentRequired");
  });
});
