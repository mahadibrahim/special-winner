import { describe, it, expect } from "vitest";
import {
  getAdminCookie,
  getParentCookie,
  apiFetch,
} from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Unique-per-run day spread so consecutive runs never reuse the same slot.
// Per-run base date, kept inside the 4-digit-year range so toISOString()
// doesn't produce a `+`-prefixed extended-year string that pg rejects.
// 10 years × 365 days = ~3650 distinct days; with 3 fields × multiple
// hours per run that's enormous slot space — collision-free in practice.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

function slot(hour: number, durationHours: number) {
  const start = new Date(RUN_BASE_UTC + hour * 3_600_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// Each test uses a distinct field number to avoid intra-suite conflicts.
const FIELD_CASH = 10;
const FIELD_COMP = 11;
const FIELD_OWNERSHIP = 12;

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    renterName: "Admin Test Renter",
    renterPhone: "614-555-0001",
    partySize: 4,
    paymentMethod: "cash",
    ...overrides,
  };
}

describe("POST /api/admin/rentals", () => {
  it("cash booking → 200, confirmed, paid, amountPaidCents > 0", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/rentals", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        baseBody({
          fieldNumber: FIELD_CASH,
          ...slot(9, 1),
          paymentMethod: "cash",
        }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentRequired).toBe(false);
    expect(body.rental.status).toBe("confirmed");
    expect(body.rental.paymentStatus).toBe("paid");
    expect(body.rental.amountPaidCents).toBeGreaterThan(0);
  });

  it("comp booking → 200, amountDueCents === 0, paymentStatus paid", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/rentals", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        baseBody({
          fieldNumber: FIELD_COMP,
          ...slot(11, 1),
          paymentMethod: "comp",
        }),
      ),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.amountDueCents).toBe(0);
    expect(body.rental.paymentStatus).toBe("paid");
  });

  it("random venueId (not in org) → 404 ownership denied", async () => {
    const cookie = await getAdminCookie();
    // Generate a valid UUID format that won't belong to the org.
    const fakeVenueId = "00000000-dead-beef-cafe-000000000000";
    const res = await apiFetch("/api/admin/rentals", {
      method: "POST",
      cookie,
      body: JSON.stringify(
        baseBody({
          venueId: fakeVenueId,
          fieldNumber: FIELD_OWNERSHIP,
          ...slot(13, 1),
        }),
      ),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/rentals", () => {
  it("?status=confirmed as admin → 200, array, every row confirmed", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/rentals?status=confirmed", {
      cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rentals)).toBe(true);
    for (const row of body.rentals) {
      expect(row.status).toBe("confirmed");
    }
  });

  it("no cookie → 401 or 403", async () => {
    const res = await apiFetch("/api/admin/rentals");
    expect([401, 403]).toContain(res.status);
  });

  it("parent cookie → 401 or 403 (admin gating)", async () => {
    const cookie = await getParentCookie();
    const res = await apiFetch("/api/admin/rentals", { cookie });
    expect([401, 403]).toContain(res.status);
  });
});
