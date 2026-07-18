/**
 * Integration: renter-owned roster endpoints for field rentals.
 *   POST   /api/rentals/bookings/:id/players       → add a player (200)
 *   GET    /api/rentals/bookings/:id/players        → roster + {signed, total}
 *   DELETE /api/rentals/bookings/:id/players/:playerId → remove a pending player
 * 403 for a non-owner across the board. Runs over HTTP against the running
 * dev server, seeding rows directly via getDb() like the sibling rentals
 * tests (mirrors pay.test.ts's setup).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { getParentCookie, getCoachCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const orgId = E2E_ORG_ID;
let parentUserId: string;
let cookie: string;
let otherCookie: string;

// Distinct far-future day per run so concurrent CI runs never collide on the
// same field/time slot (mirrors pay.test.ts / request.test.ts).
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2039, 0, 1) + RUN_DAY_OFFSET * 86_400_000;
let fieldCounter = 20;

beforeAll(async () => {
  cookie = await getParentCookie();
  // /api/auth/me returns { user: { id, email, ... }, authenticated: true }
  // when locals.user/session are set (src/pages/api/auth/me.ts) — verified
  // by reading the route directly rather than assuming the shape.
  const me = await apiFetch("/api/auth/me", { method: "GET", cookie });
  const meBody = await me.json();
  parentUserId = meBody.user.id;
  otherCookie = await getCoachCookie();
});

async function makeConfirmedRental(userId: string | null) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: fieldCounter++,
      startsAt: new Date(RUN_BASE_UTC + 12 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 13 * 3_600_000),
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      paymentStatus: "paid",
      amountDueCents: 5000,
      amountPaidCents: 5000,
      renterUserId: userId,
      renterName: "Roster Tester",
      renterEmail: "roster-tester@example.com",
    })
    .returning();
  return r.id;
}

describe("Rentals roster endpoints", () => {
  it("POST adds a player to the roster (200)", async () => {
    const id = await makeConfirmedRental(parentUserId);
    const res = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        playerName: "Kid Player",
        signerEmail: "guardian@example.com",
        isMinor: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
  });

  it("GET shows the added player and a {signed, total} summary", async () => {
    const id = await makeConfirmedRental(parentUserId);
    const postRes = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        playerName: "Another Player",
        signerEmail: "guardian2@example.com",
        isMinor: false,
      }),
    });
    expect(postRes.status).toBe(200);

    const res = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "GET",
      cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.signed).toBe(0);
    expect(body.players).toHaveLength(1);
    expect(body.players[0].playerName).toBe("Another Player");
    expect(body.players[0].status).toBe("pending");
  });

  it("DELETE removes a pending player", async () => {
    const id = await makeConfirmedRental(parentUserId);
    const postRes = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        playerName: "Removable Player",
        signerEmail: "guardian3@example.com",
        isMinor: false,
      }),
    });
    const { id: playerId } = await postRes.json();

    const delRes = await apiFetch(`/api/rentals/bookings/${id}/players/${playerId}`, {
      method: "DELETE",
      cookie,
    });
    expect(delRes.status).toBe(200);

    const getRes = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "GET",
      cookie,
    });
    const getBody = await getRes.json();
    expect(getBody.total).toBe(0);
  });

  it("403 for a non-owner on GET/POST/DELETE", async () => {
    const id = await makeConfirmedRental(parentUserId);

    const getRes = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "GET",
      cookie: otherCookie,
    });
    expect(getRes.status).toBe(403);

    const postRes = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "POST",
      cookie: otherCookie,
      body: JSON.stringify({
        playerName: "Intruder Player",
        signerEmail: "intruder@example.com",
        isMinor: false,
      }),
    });
    expect(postRes.status).toBe(403);

    const delRes = await apiFetch(`/api/rentals/bookings/${id}/players/some-id`, {
      method: "DELETE",
      cookie: otherCookie,
    });
    expect(delRes.status).toBe(403);
  });

  it("422 for an invalid signerEmail", async () => {
    const id = await makeConfirmedRental(parentUserId);
    const res = await apiFetch(`/api/rentals/bookings/${id}/players`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        playerName: "Bad Email Player",
        signerEmail: "not-an-email",
        isMinor: false,
      }),
    });
    expect(res.status).toBe(422);
  });
});
