/**
 * POST /api/dropin/bookings/:id/waiver — post-payment waiver signing
 * ("sign before you PLAY, not before you pay").
 *
 * Covers the two auth paths and idempotency:
 *   - signed-in booking owner
 *   - guest capability token (the booking's stripe_payment_intent_id)
 *   - already-signed → 200 no-op, first signature stands
 *   - strangers (no session, wrong/absent PI) → 404, no data leak
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { apiFetch, expectJson, getParentCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

// HTTP requests to localhost resolve the DEFAULT org via the domain
// resolver; fixtures must live under it or the endpoint's multi-tenant
// guard 403s.
let defaultOrg: { organizationId: string; venueId: string };

beforeAll(async () => {
  defaultOrg = await resolveDefaultOrgForHttpTests();
});

const freeSessionInDefaultOrg = () =>
  createTestDropInSession({
    organizationId: defaultOrg.organizationId,
    venueId: defaultOrg.venueId,
    sessionRateCents: 0,
    memberRateCents: 0,
  });

/** Book a free session as the parent test account WITHOUT a waiver —
 *  the current UI's flow — and return the unsigned booking id. */
async function bookUnsignedAsParent(cookie: string): Promise<string> {
  const ctx = await freeSessionInDefaultOrg();
  const res = await apiFetch("/api/dropin/bookings", {
    method: "POST",
    cookie,
    body: JSON.stringify({ sessionId: ctx.sessionId }),
  });
  const json = await expectJson(res, 200);
  expect(json.paymentRequired).toBe(false);
  return json.bookingId as string;
}

/** Direct DB insert of a confirmed, unsigned booking for a fresh
 *  passwordless user carrying a PaymentIntent id — the shape the webhook
 *  writes for an inline guest payment. */
async function insertGuestBookingWithPi(): Promise<{
  bookingId: string;
  paymentIntentId: string;
}> {
  const db = getDb();
  const ctx = await freeSessionInDefaultOrg();
  const [user] = await db
    .insert(users)
    .values({
      email: `dropin-waiver-pi-${Date.now()}-${Math.random()}@t.example`,
      firstName: "Waiver",
      lastName: "Guest",
    })
    .returning();
  const paymentIntentId = `pi_waiver_test_${Math.random().toString(36).slice(2)}`;
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: ctx.sessionId,
      userId: user.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
      stripePaymentIntentId: paymentIntentId,
      waiverSigned: false,
    })
    .returning();
  return { bookingId: booking.id, paymentIntentId };
}

describe("POST /api/dropin/bookings/:id/waiver", () => {
  it("signs via the owner's session, then no-ops on re-sign (first signature stands)", async () => {
    const cookie = await getParentCookie();
    const bookingId = await bookUnsignedAsParent(cookie);

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Parent Signer" }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);
    expect(json.alreadySigned).toBe(false);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Parent Signer");
    expect(row.waiverSignedAt).not.toBeNull();

    // Idempotent: a second sign is a 200 no-op and never overwrites.
    const again = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ waiverName: "Someone Else" }),
    });
    const againJson = await expectJson(again, 200);
    expect(againJson.alreadySigned).toBe(true);

    const [after] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(after.waiverSignedBy).toBe("Parent Signer");
  });

  it("signs via the PaymentIntent capability token — no login session", async () => {
    const { bookingId, paymentIntentId } = await insertGuestBookingWithPi();

    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({
        waiverName: "Guest Signer",
        paymentIntentId,
      }),
    });
    const json = await expectJson(res, 200);
    expect(json.ok).toBe(true);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Guest Signer");
  });

  it("404s a caller with no session and no/wrong capability token", async () => {
    const { bookingId } = await insertGuestBookingWithPi();

    const noToken = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({ waiverName: "Stranger" }),
    });
    expect(noToken.status).toBe(404);

    const wrongToken = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({
        waiverName: "Stranger",
        paymentIntentId: "pi_wrong_token",
      }),
    });
    expect(wrongToken.status).toBe(404);

    const db = getDb();
    const [row] = await db
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId));
    expect(row.waiverSigned).toBe(false);
  });

  it("400s an empty waiverName", async () => {
    const { bookingId, paymentIntentId } = await insertGuestBookingWithPi();
    const res = await apiFetch(`/api/dropin/bookings/${bookingId}/waiver`, {
      method: "POST",
      body: JSON.stringify({ waiverName: "   ", paymentIntentId }),
    });
    expect(res.status).toBe(400);
  });
});
