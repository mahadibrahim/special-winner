/**
 * Unit/integration tests for handleDropinWalkinPayment.
 *
 * Seeds drop-in sessions and pending_claim bookings directly, then calls
 * the handler at the library level (no HTTP). Mirrors the structure of
 * tests/api/rentals/webhook.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { handleDropinWalkinPayment } from "@/lib/stripe/handle-dropin-walkin-payment";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

// ── per-run slot helpers ────────────────────────────────────────────────────
// Random day offset keeps this file's inserts from colliding with parallel
// test runs or other walkin tests that also insert into drop_in_sessions.
const RUN_DAY_OFFSET = Math.floor(Math.random() * 3_650);
const RUN_BASE_UTC = Date.UTC(2035, 6, 1) + RUN_DAY_OFFSET * 86_400_000;
const UNIQUE_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function sessionSlot(hourOfDay: number) {
  const startsAt = new Date(RUN_BASE_UTC + hourOfDay * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  return { startsAt, endsAt };
}

// ── shared test user ────────────────────────────────────────────────────────
// One throwaway user shared across all tests in this file. The unique email
// prevents conflicts with other test runs on the same staging DB.
let testUserId: string;

beforeAll(async () => {
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `walkin-wh-${UNIQUE_SUFFIX}@test.invalid`,
      firstName: "Walkin",
      lastName: "WhTest",
    })
    .returning();
  testUserId = u.id;
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function seedSession(hourOfDay: number) {
  const { startsAt, endsAt } = sessionSlot(hourOfDay);
  const [session] = await getDb()
    .insert(dropInSessions)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      kind: "pickup",
      sportOrClassLabel: `walkin-wh-${UNIQUE_SUFFIX}-h${hourOfDay}`,
      startsAt,
      endsAt,
      capacity: 20,
      teamCount: 2,
      teamColors: ["red", "blue"],
      sessionRateCents: 1500,
    })
    .returning();
  return session;
}

async function seedPendingClaimBooking(sessionId: string, userId = testUserId) {
  const [booking] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "pending_claim",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 0,
    })
    .returning();
  return booking;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("handleDropinWalkinPayment", () => {
  it("happy path: flips pending_claim booking to confirmed", async () => {
    const session = await seedSession(10);
    const booking = await seedPendingClaimBooking(session.id);

    const fakePiId = `pi_test_dropin_wh_${Date.now()}`;
    const fakePI = {
      id: fakePiId,
      metadata: { type: "dropin_walkin", booking_id: booking.id },
      amount_received: 1500,
      amount: 1500,
    } as unknown as Stripe.PaymentIntent;

    const result = await handleDropinWalkinPayment(fakePI);

    expect(result.status).toBe("processed");
    if (result.status !== "processed") throw new Error("handler did not process");
    expect(result.bookingId).toBe(booking.id);
    expect(result.paidCents).toBe(1500);

    // Re-fetch and assert DB state
    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));

    expect(row).toBeDefined();
    expect(row!.status).toBe("confirmed");
    expect(row!.amountPaidCents).toBe(1500);
    expect(row!.stripePaymentIntentId).toBe(fakePiId);
    expect(row!.promotionExpiresAt).toBeNull();
  });

  it("idempotency: second call on confirmed booking returns skipped", async () => {
    const session = await seedSession(11);
    const booking = await seedPendingClaimBooking(session.id);

    const fakePiId = `pi_test_dropin_wh_idem_${Date.now()}`;
    const fakePI = {
      id: fakePiId,
      metadata: { type: "dropin_walkin", booking_id: booking.id },
      amount_received: 1500,
      amount: 1500,
    } as unknown as Stripe.PaymentIntent;

    // First call — should process
    const first = await handleDropinWalkinPayment(fakePI);
    expect(first.status).toBe("processed");

    // Second call with same PI — should skip (already confirmed)
    const second = await handleDropinWalkinPayment(fakePI);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("already confirmed");
  });

  it("returns skipped when metadata has no booking_id", async () => {
    const result = await handleDropinWalkinPayment({
      id: "pi_noop",
      metadata: {},
      amount_received: 0,
      amount: 0,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toBe("missing booking_id metadata");
  });

  it("returns skipped when booking_id does not exist in the database", async () => {
    const result = await handleDropinWalkinPayment({
      id: "pi_notfound",
      metadata: { type: "dropin_walkin", booking_id: "00000000-0000-0000-0000-000000000000" },
      amount_received: 1500,
      amount: 1500,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("not found");
  });

  it("cancelled-guard: late webhook does not flip a cancelled booking", async () => {
    const session = await seedSession(12);
    const booking = await seedPendingClaimBooking(session.id);

    // Directly cancel the booking to simulate a refund/cancel before the
    // walk-in payment webhook arrives.
    await getDb()
      .update(dropInBookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(dropInBookings.id, booking.id));

    const result = await handleDropinWalkinPayment({
      id: `pi_test_dropin_wh_cancel_${Date.now()}`,
      metadata: { type: "dropin_walkin", booking_id: booking.id },
      amount_received: 1500,
      amount: 1500,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("already cancelled");

    // Verify the booking is still cancelled, not flipped back
    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(row!.status).toBe("cancelled");
  });
});
