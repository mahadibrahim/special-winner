/**
 * Unit/integration tests for handleDropinWalkinPayment.
 *
 * Seeds drop-in sessions and pending bookings directly, then calls the
 * handler at the library level (no HTTP). Mirrors the structure of
 * tests/api/rentals/webhook.test.ts.
 *
 * The handler accepts bookings in either `pending_payment` (current hold
 * status — see walkin/start.ts) or `pending_claim` (legacy, pre-cutover
 * stranded holds). Most cases here exercise `pending_claim` fixtures since
 * that was the original shape of this suite; a dedicated case below covers
 * the `pending_payment` path.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { handleDropinWalkinPayment } from "@/lib/stripe/handle-dropin-walkin-payment";
import { E2E_RENTAL_VENUE_ID, E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Mock ONLY the stripe client the handler's late-refund branch calls —
// everything else in the module is untouched. The rest of this file's tests
// never reach a Stripe API call (fake PaymentIntent objects go straight to
// the handler), so the mock is inert for them; the late-payment-refund tests
// below assert against `refundCreateMock` deterministically instead of
// hitting the live test-mode API.
const { refundCreateMock } = vi.hoisted(() => ({
  refundCreateMock: vi.fn(),
}));
vi.mock("@/lib/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/client")>();
  return {
    ...actual,
    stripe: { refunds: { create: refundCreateMock } },
  };
});

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

async function seedPendingPaymentBooking(sessionId: string, userId = testUserId) {
  const [booking] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "pending_payment",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 0,
      promotionExpiresAt: new Date(Date.now() + 2 * 3_600_000),
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

  it("happy path: flips pending_payment booking to confirmed and clears promotionExpiresAt", async () => {
    const session = await seedSession(20);
    const booking = await seedPendingPaymentBooking(session.id);
    expect(booking.promotionExpiresAt).not.toBeNull();

    const fakePiId = `pi_test_dropin_wh_pp_${Date.now()}`;
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

  it("cancelled-guard: late webhook with no captured funds does not flip or refund", async () => {
    const session = await seedSession(12);
    const booking = await seedPendingClaimBooking(session.id);

    // Directly cancel the booking to simulate a refund/cancel before the
    // walk-in payment webhook arrives.
    await getDb()
      .update(dropInBookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(dropInBookings.id, booking.id));

    refundCreateMock.mockClear();

    // amount_received: 0 — nothing was captured, so the cancelled-guard
    // must skip WITHOUT attempting a refund (the auto-refund branch only
    // fires when money actually moved; see the dedicated tests below).
    const result = await handleDropinWalkinPayment({
      id: `pi_test_dropin_wh_cancel_${Date.now()}`,
      metadata: { type: "dropin_walkin", booking_id: booking.id },
      amount_received: 0,
      amount: 1500,
    } as unknown as Stripe.PaymentIntent);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("already cancelled");
    expect(refundCreateMock).not.toHaveBeenCalled();

    // Verify the booking is still cancelled, not flipped back
    const [row] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(row!.status).toBe("cancelled");
  });

  // ── late payment on a swept hold → auto-refund (C1) ──────────────────────
  // The race this covers: the customer's confirmPayment is in flight while
  // the expiry sweep cancels the hold. The charge captures, the webhook
  // arrives, the booking is already cancelled — the handler must refund the
  // PaymentIntent automatically instead of silently keeping the money.
  describe("late payment on a swept (cancelled) hold", () => {
    it("auto-refunds the captured charge exactly once and records the refund id", async () => {
      const session = await seedSession(13);
      const booking = await seedPendingPaymentBooking(session.id);

      // Sweep cancels the hold (same transition expireOverduePromotions does).
      await getDb()
        .update(dropInBookings)
        .set({
          status: "cancelled",
          cancellationReason: "expired_payment_hold",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dropInBookings.id, booking.id));

      const fakePiId = `pi_test_dropin_wh_late_${Date.now()}`;
      const fakeRefundId = `re_test_${Date.now()}`;
      refundCreateMock.mockClear();
      refundCreateMock.mockResolvedValue({ id: fakeRefundId });

      const fakePI = {
        id: fakePiId,
        metadata: { type: "dropin_walkin", booking_id: booking.id },
        amount_received: 1500,
        amount: 1500,
      } as unknown as Stripe.PaymentIntent;

      const result = await handleDropinWalkinPayment(fakePI);

      expect(result.status).toBe("skipped");
      if (result.status !== "skipped") throw new Error("expected skipped");
      expect(result.reason).toContain("auto-refunded");
      expect(result.reason).toContain(fakeRefundId);

      // Exactly one refund, full amount (no `amount` param = full refund),
      // with the sweep-refund idempotency key.
      expect(refundCreateMock).toHaveBeenCalledTimes(1);
      expect(refundCreateMock).toHaveBeenCalledWith(
        { payment_intent: fakePiId },
        { idempotencyKey: `${fakePiId}:sweep-refund` },
      );

      // The booking stays cancelled with the refund recorded — NOT
      // confirmed, NOT marked paid.
      const [row] = await getDb()
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, booking.id));
      expect(row!.status).toBe("cancelled");
      expect(row!.amountPaidCents).toBe(0);
      expect(row!.stripePaymentIntentId).toBe(fakePiId);
      expect(row!.stripeRefundId).toBe(fakeRefundId);

      // Redelivery of the same webhook after the refund id is on record —
      // must short-circuit without a second refunds.create call.
      const second = await handleDropinWalkinPayment(fakePI);
      expect(second.status).toBe("skipped");
      if (second.status !== "skipped") throw new Error("expected skipped");
      expect(second.reason).toContain("already refunded");
      expect(refundCreateMock).toHaveBeenCalledTimes(1);
    });

    it("refund failure: alerts, records the PI for manual refund, and reports a distinct reason", async () => {
      const session = await seedSession(14);
      const booking = await seedPendingPaymentBooking(session.id);

      await getDb()
        .update(dropInBookings)
        .set({
          status: "cancelled",
          cancellationReason: "expired_payment_hold",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dropInBookings.id, booking.id));

      const fakePiId = `pi_test_dropin_wh_latefail_${Date.now()}`;
      refundCreateMock.mockClear();
      refundCreateMock.mockRejectedValue(new Error("stripe boom"));

      const result = await handleDropinWalkinPayment({
        id: fakePiId,
        metadata: { type: "dropin_walkin", booking_id: booking.id },
        amount_received: 1500,
        amount: 1500,
      } as unknown as Stripe.PaymentIntent);

      expect(result.status).toBe("skipped");
      if (result.status !== "skipped") throw new Error("expected skipped");
      expect(result.reason).toContain("manual refund required");
      expect(result.reason).toContain(fakePiId);

      // PI recorded so staff can refund by hand; no refund id (it failed);
      // booking stays cancelled.
      const [row] = await getDb()
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, booking.id));
      expect(row!.status).toBe("cancelled");
      expect(row!.stripePaymentIntentId).toBe(fakePiId);
      expect(row!.stripeRefundId).toBeNull();
    });
  });
});
