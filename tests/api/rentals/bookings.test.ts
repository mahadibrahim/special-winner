import { describe, it, expect, beforeAll } from "vitest";
import {
  getParentCookie,
  apiFetch,
} from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Unique per-run offset so re-runs don't collide with prior rows in the
// shared staging DB. We carve out a slot in the 2027-03 range, within the
// venue's 08:00–22:00 UTC rental window, 1h duration.
const RUN_OFFSET_MS = (Date.now() % 50) * 3600_000; // 0–49h bucket

function slot(fieldOffsetHours: number, durationHours = 1) {
  // Base: 2027-03-15 10:00 UTC + offset + fieldOffsetHours
  const startMs =
    Date.UTC(2027, 2, 15, 10, 0, 0) +
    RUN_OFFSET_MS +
    fieldOffsetHours * 3600_000;
  const startsAt = new Date(startMs);
  const endsAt = new Date(startMs + durationHours * 3600_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    fieldNumber: 1,
    ...slot(0),
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
    // Use a distinct slot (field 2, offset by 100h) so it doesn't collide
    // with the conflict test file's field 3 bookings.
    const res = await apiFetch("/api/rentals/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        validBody({ fieldNumber: 2, ...slot(100) }),
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
