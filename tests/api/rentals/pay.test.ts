/**
 * Integration: POST /api/rentals/bookings/:id/pay mints a fresh Stripe
 * Checkout Session for a renter-owned pending_payment rental. 403 for a
 * rental owned by someone else (or no one), 422 once it's no longer
 * pending_payment. Runs over HTTP against the running dev server, seeding
 * rows directly via getDb() like the sibling rentals tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { getParentCookie, apiFetch } from "../setup/test-helpers";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

const orgId = E2E_ORG_ID;
let parentUserId: string;
let cookie: string;

// Distinct far-future day per run so concurrent CI runs never collide on the
// same field/time slot (mirrors request.test.ts / expire.test.ts).
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2039, 0, 1) + RUN_DAY_OFFSET * 86_400_000;

beforeAll(async () => {
  cookie = await getParentCookie();
  // /api/auth/me returns { user: { id, email, ... }, authenticated: true }
  // when locals.user/session are set (src/pages/api/auth/me.ts) — verified
  // by reading the route directly rather than assuming the shape.
  const me = await apiFetch("/api/auth/me", { method: "GET", cookie });
  const meBody = await me.json();
  parentUserId = meBody.user.id;
});

async function makePendingRental(userId: string | null) {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId: E2E_RENTAL_VENUE_ID,
      fieldNumber: 8,
      startsAt: new Date(RUN_BASE_UTC + 12 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 13 * 3_600_000),
      status: "pending_payment",
      source: "online_booking",
      paymentMethod: "card_online",
      amountDueCents: 5000,
      renterUserId: userId,
      renterName: "Pay Tester",
      paymentExpiresAt: new Date(Date.now() + 24 * 3_600_000),
    })
    .returning();
  return r.id;
}

describe("POST /api/rentals/bookings/:id/pay", () => {
  it("403 when the rental is not the caller's", async () => {
    const id = await makePendingRental(null);
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(403);
  });

  it("owner path returns a checkoutUrl (or flags Stripe unconfigured)", async () => {
    const id = await makePendingRental(parentUserId);
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, {
      method: "POST",
      cookie,
    });
    const body = await res.json();
    if (res.status === 500 && body.error === "Stripe not configured") return;
    expect(res.status).toBe(200);
    expect(typeof body.checkoutUrl).toBe("string");
  });

  it("422 when the rental is not pending_payment", async () => {
    const id = await makePendingRental(parentUserId);
    await getDb()
      .update(fieldRentals)
      .set({ status: "requested" })
      .where(eq(fieldRentals.id, id));
    const res = await apiFetch(`/api/rentals/bookings/${id}/pay`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(422);
  });
});
