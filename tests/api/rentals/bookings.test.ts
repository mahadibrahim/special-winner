import { describe, it, expect, beforeAll } from "vitest";
import {
  getParentCookie,
  apiFetch,
} from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// A distinct calendar DAY per test run, far in the future, at a fixed
// within-window hour. Date.now() spread across millions of distinct days
// means consecutive runs (even seconds apart) never reuse a slot.
// Per-run base date, kept inside the 4-digit-year range so toISOString()
// doesn't produce a `+`-prefixed extended-year string that pg rejects.
// 10 years × 365 days = ~3650 distinct days; with 3 fields × multiple
// hours per run that's enormous slot space — collision-free in practice.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const DAY_MS = 86_400_000;
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * DAY_MS;

/**
 * Build a slot inside the venue rental window (8am-10pm UTC). `hourOfDay`
 * stays between 9 and 19 so a 1-2h booking ends by 21:00.
 */
function slot(hourOfDay: number, durationHours: number) {
  const start = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: 1,
    ...slot(9, 1),
    partySize: 4,
    purpose: "scrimmage",
    waiverAccepted: true,
    waiverName: "Test Parent",
    ...overrides,
  };
}

describe("POST /api/rentals/bookings", () => {
  it("guest (no auth) can request with contact info", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        validBody({
          fieldNumber: 1,
          ...slot(12, 1),
          renterName: "Guest Gal",
          renterEmail: `guest_${Date.now()}@test.aspiresports.com`,
        }),
      ),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).requested).toBe(true);
  });

  it("returns 422 when waiverAccepted is false", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        validBody({ waiverAccepted: false }),
      ),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  // Under E2E_TEST_ENDPOINTS=yes (the flag the dev server runs with here) the
  // min-lead-time guard is skipped along with the near/far-window checks, so
  // these far-future slots go straight to `requested: true`. The guard's
  // 422 path is unit-tested separately, not over HTTP against a shared slot
  // space.
  it("returns 200 with requested:true for a valid booking request", async () => {
    const cookie = await getParentCookie();
    // Use a distinct slot (field 1, hour 14) so it doesn't collide with
    // conflict.test.ts which uses field 2 at hours 10-13.
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...slot(14, 2) })),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.requested).toBe(true);
    expect(typeof body.rentalId).toBe("string");
    expect(body).not.toHaveProperty("checkoutUrl");
  });

  it("holds the slot — a second request for the same slot conflicts", async () => {
    const cookie = await getParentCookie();
    const s = slot(16, 1);
    const first = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(first.status).toBe(200);
    const second = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(validBody({ fieldNumber: 1, ...s })),
    });
    expect(second.status).toBe(409);
  });
});

describe("GET /api/rentals/bookings", () => {
  let parentCookie: string;

  beforeAll(async () => {
    parentCookie = await getParentCookie();
  });

  it("returns 200 with rentals array for authenticated user", async () => {
    const res = await apiFetch("/api/rentals/bookings", {
      method: "GET",
      cookie: parentCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rentals)).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });
});
