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
  it("returns 401 when not authenticated", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
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

  it("returns 200 with paymentRequired and checkoutUrl for a valid paid booking", async () => {
    const cookie = await getParentCookie();
    // Use a distinct slot (field 1, hour 14) so it doesn't collide with
    // conflict.test.ts which uses field 2 at hours 10-13.
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        validBody({ fieldNumber: 1, ...slot(14, 2) }),
      ),
    });
    const body = await res.json();
    // If Stripe is not configured the endpoint returns 500 — flag it.
    if (res.status === 500 && body?.error === "Stripe not configured") {
      console.warn(
        "[bookings.test] Stripe not configured in staging env — paid path cannot be verified",
      );
      return;
    }
    expect(res.status).toBe(200);
    expect(body.paymentRequired).toBe(true);
    expect(typeof body.checkoutUrl).toBe("string");
    expect(typeof body.rentalId).toBe("string");
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
