import { describe, it, expect } from "vitest";
import {
  getAdminCookie,
  apiFetch,
} from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Per-run base date inside the 4-digit-year range (years 2035-2045).
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
function slot(hour: number, durationHours: number) {
  const start = new Date(RUN_BASE_UTC + hour * 3_600_000);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

// Distinct field numbers to avoid intra-suite conflicts.
// Use 20+ range to avoid colliding with admin-rentals.test.ts (10-12).
const FIELD_CASH_REFUND = 20;
const FIELD_CARD_ONLINE_CANCEL = 21;
const FIELD_CASH_PAID_CANCEL = 22;
const FIELD_GET_DETAIL = 23;
const FIELD_PATCH_NOTES = 24;

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    venueId: E2E_RENTAL_VENUE_ID,
    renterName: "Refund Test Renter",
    renterPhone: "614-555-0099",
    partySize: 2,
    paymentMethod: "cash" as const,
    ...overrides,
  };
}

async function createRental(
  cookie: string,
  fieldNumber: number,
  hour: number,
  overrides: Record<string, unknown> = {},
) {
  const res = await apiFetch("/api/admin/rentals", {
    method: "POST",
    cookie,
    body: JSON.stringify(
      baseBody({
        fieldNumber,
        ...slot(hour, 1),
        ...overrides,
      }),
    ),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.rental as { id: string; status: string; paymentStatus: string; amountPaidCents: number };
}

describe("POST /api/admin/rentals/:id/refund", () => {
  it("cash rental → refund 200, status=cancelled, cancellationReason=admin_override", async () => {
    const cookie = await getAdminCookie();
    const rental = await createRental(cookie, FIELD_CASH_REFUND, 9, {
      paymentMethod: "cash",
    });
    expect(rental.paymentStatus).toBe("paid");
    expect(rental.amountPaidCents).toBeGreaterThan(0);

    const res = await apiFetch(`/api/admin/rentals/${rental.id}/refund`, {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.status).toBe("cancelled");
    expect(body.rental.cancellationReason).toBe("admin_override");
  });

  it("refunding same rental again → 409 already cancelled", async () => {
    const cookie = await getAdminCookie();
    // Re-use the already cancelled rental from the previous test — but since
    // tests may run independently, we create a fresh one and cancel it first.
    const rental = await createRental(cookie, FIELD_CASH_REFUND, 10, {
      paymentMethod: "cash",
    });

    // First refund
    const first = await apiFetch(`/api/admin/rentals/${rental.id}/refund`, {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    expect(first.status).toBe(200);

    // Second refund on same rental → 409
    const second = await apiFetch(`/api/admin/rentals/${rental.id}/refund`, {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("Rental already cancelled");
  });
});

describe("PATCH /api/admin/rentals/:id — cancel unpaid card_online rental", () => {
  it("card_online (unpaid) rental → PATCH cancel=true → 200, status=cancelled", async () => {
    const cookie = await getAdminCookie();
    // card_online rentals are created with paymentStatus=unpaid via admin POST
    const rental = await createRental(cookie, FIELD_CARD_ONLINE_CANCEL, 11, {
      paymentMethod: "card_online",
    });
    // card_online rentals come back with paymentStatus unpaid
    expect(rental.paymentStatus).toBe("unpaid");

    const res = await apiFetch(`/api/admin/rentals/${rental.id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ cancel: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.status).toBe("cancelled");
  });
});

describe("PATCH /api/admin/rentals/:id — paid cash rental → 422 must use refund", () => {
  it("cash paid rental + cancel=true → 422", async () => {
    const cookie = await getAdminCookie();
    const rental = await createRental(cookie, FIELD_CASH_PAID_CANCEL, 12, {
      paymentMethod: "cash",
    });
    expect(rental.paymentStatus).toBe("paid");
    expect(rental.amountPaidCents).toBeGreaterThan(0);

    const res = await apiFetch(`/api/admin/rentals/${rental.id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ cancel: true }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/refund/i);
  });
});

describe("GET /api/admin/rentals/:id", () => {
  it("nonexistent UUID → 404", async () => {
    const cookie = await getAdminCookie();
    const fakeId = "00000000-dead-beef-cafe-ffffffffffff";
    const res = await apiFetch(`/api/admin/rentals/${fakeId}`, { cookie });
    expect(res.status).toBe(404);
  });

  it("existing rental we own → 200, body has rental and venue, rental.id matches", async () => {
    const cookie = await getAdminCookie();
    const rental = await createRental(cookie, FIELD_GET_DETAIL, 13, {
      paymentMethod: "cash",
    });

    const res = await apiFetch(`/api/admin/rentals/${rental.id}`, { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("rental");
    expect(body).toHaveProperty("venue");
    expect(body.rental.id).toBe(rental.id);
  });
});

describe("PATCH /api/admin/rentals/:id — update notes", () => {
  it("PATCH { notes: 'hello' } on confirmed rental → 200, rental.notes === 'hello'", async () => {
    const cookie = await getAdminCookie();
    const rental = await createRental(cookie, FIELD_PATCH_NOTES, 14, {
      paymentMethod: "cash",
    });

    const res = await apiFetch(`/api/admin/rentals/${rental.id}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ notes: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rental.notes).toBe("hello");
  });
});

describe("Auth guards", () => {
  it("POST /api/admin/rentals/:id/refund with no cookie → 401 or 403", async () => {
    const res = await apiFetch(
      `/api/admin/rentals/00000000-dead-beef-cafe-ffffffffffff/refund`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect([401, 403]).toContain(res.status);
  });

  it("PATCH /api/admin/rentals/:id with no cookie → 401 or 403", async () => {
    const res = await apiFetch(
      `/api/admin/rentals/00000000-dead-beef-cafe-ffffffffffff`,
      { method: "PATCH", body: JSON.stringify({ notes: "x" }) },
    );
    expect([401, 403]).toContain(res.status);
  });
});
