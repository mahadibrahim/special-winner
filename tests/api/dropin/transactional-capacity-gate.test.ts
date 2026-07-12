/**
 * Transactional capacity gate — the last-spot race fix (P2
 * 39b40b5d-af23-816f, docs/superpowers/specs/
 * 2026-07-12-transactional-capacity-gate-design.md).
 *
 * The race: between a customer clicking "Book" (paid path) and Stripe
 * confirming their payment, some OTHER confirm point (free-path booking,
 * another paid Checkout, a kiosk walk-in hold, or a promoted waitlister
 * claiming) can take the session's last seat. Every confirm point now
 * re-checks capacity through the shared `checkSessionCapacityLocked`
 * helper (src/lib/dropin/booking.ts) INSIDE the same transaction that
 * already holds `SELECT ... FOR UPDATE` on the session row — so the
 * count-then-decide read is consistent under concurrency, not just
 * sequentially correct.
 *
 * LOCK ORDERING (documented here per the task's concurrency-reasoning
 * requirement): every confirm point locks the SESSION row first, then
 * reads/writes booking rows — free-path (booking.ts), the paid Checkout
 * webhook (handle-dropin-checkout-complete.ts), the walk-in payment
 * webhook (handle-dropin-walkin-payment.ts), and the kiosk hold creation
 * (walkin/start.ts) all follow this order. None of them ever lock a
 * booking row and then the session row, so two concurrent confirm
 * attempts on the same session simply serialize on the session-row lock —
 * no lock-ordering deadlock is possible between these paths.
 *
 * Real concurrent-request interleaving isn't exercised here (vitest drives
 * HTTP/library calls serially — see payment-task-2-report.md's "No true
 * concurrency test added" note for the same reasoning this codebase
 * already applies to the walk-in duplicate-hold guard). Instead, each test
 * below sets up the END STATE a race would produce — a seat already taken
 * by the time the second confirm point runs its capacity check — and
 * asserts the gate rejects (free path, kiosk hold) or overflows safely
 * (paid webhook) rather than double-booking the seat.
 */
import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { promoteNextWaitlister } from "@/lib/dropin/promotion";
import { processCancelRefund } from "@/lib/dropin/refund";
import { handleDropInCheckoutComplete } from "@/lib/stripe/handle-dropin-checkout-complete";
import { apiFetch } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

// Mock ONLY the stripe client's refunds.create — mirrors the pattern in
// tests/api/check-in/walkin-payment-webhook.test.ts. Everything else in
// handle-dropin-checkout-complete.ts is untouched. vi.mock is hoisted above
// the imports above at runtime, so handleDropInCheckoutComplete picks up
// the mocked client.
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

async function insertTestUser(label: string) {
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `${label}-${Date.now()}-${Math.random()}@t.example`,
      firstName: label,
      lastName: "User",
    })
    .returning();
  return u;
}

async function insertConfirmedRow(sessionId: string, userId: string, amountPaidCents = 0) {
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents,
    })
    .returning();
  return row;
}

async function getBookingById(id: string) {
  const [row] = await getDb()
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.id, id));
  return row;
}

function makeDropinCheckoutSession(o: {
  checkoutSessionId: string;
  paymentIntentId: string;
  dropInSessionId: string;
  userId: string;
  amountTotal: number;
}): Stripe.Checkout.Session {
  return {
    id: o.checkoutSessionId,
    object: "checkout.session",
    amount_total: o.amountTotal,
    currency: "usd",
    payment_intent: o.paymentIntentId,
    payment_status: "paid",
    status: "complete",
    mode: "payment",
    metadata: {
      type: "dropin_booking",
      session_id: o.dropInSessionId,
      user_id: o.userId,
      payment_method: "card_online",
      membership_id: "",
      waiver_signed_at: new Date().toISOString(),
      waiver_name: "Test Booker",
    },
  } as unknown as Stripe.Checkout.Session;
}

describe("free-path capacity gate (checkSessionCapacityLocked)", () => {
  it("rejects session_full when a pending_payment kiosk hold has already taken the only seat", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 0,
      memberRateCents: 0,
    });
    const holder = await insertTestUser("cap-holder");
    await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: holder.id,
        status: "pending_payment",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: new Date(Date.now() + 2 * 3_600_000),
      });

    const booker = await insertTestUser("cap-booker");
    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: booker.id,
      source: "online_booking",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("session_full");
  });

  it("rejects already_booked when the user already holds a pending_payment on this session", async () => {
    const ctx = await createTestDropInSession({
      capacity: 5,
      sessionRateCents: 0,
      memberRateCents: 0,
    });
    const user = await insertTestUser("dup-hold-user");
    await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: user.id,
        status: "pending_payment",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: new Date(Date.now() + 2 * 3_600_000),
      });

    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: user.id,
      source: "online_booking",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("already_booked");
  });
});

describe("paid Checkout webhook overflow (handleDropInCheckoutComplete)", () => {
  it("waitlists front-of-line and refunds exactly once when the session fills before payment settles", async () => {
    refundCreateMock.mockClear();
    const fakeRefundId = `re_test_overflow_${Date.now()}`;
    refundCreateMock.mockResolvedValue({ id: fakeRefundId });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });

    // Someone else took the only seat while this customer's Checkout was
    // in flight — seeded directly (bypasses the orchestrator, which only
    // handles the free path) to represent the race's end state.
    const seatHolder = await insertTestUser("overflow-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("overflow-payer");
    const paymentIntentId = `pi_test_overflow_${Date.now()}`;
    const result = await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_overflow_${Date.now()}`,
        paymentIntentId,
        dropInSessionId: ctx.sessionId,
        userId: overflowUser.id,
        amountTotal: 1500,
      }),
    );

    expect(result.status).toBe("overflow");
    if (result.status !== "overflow") throw new Error("expected overflow");

    const row = await getBookingById(result.bookingId);
    expect(row.status).toBe("waitlisted");
    expect(row.waitlistPriority).toBe(100);
    expect(row.userId).toBe(overflowUser.id);
    expect(row.amountPaidCents).toBe(1500);
    expect(row.stripePaymentIntentId).toBe(paymentIntentId);
    expect(row.stripeRefundId).toBe(fakeRefundId);

    expect(refundCreateMock).toHaveBeenCalledTimes(1);
    expect(refundCreateMock).toHaveBeenCalledWith(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `${paymentIntentId}:overflow-refund` },
    );

    // The seat-holder's confirmed booking is untouched — only the
    // overflow customer was waitlisted/refunded.
    const stillConfirmedRows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    const confirmedCount = stillConfirmedRows.filter((r) => r.status === "confirmed").length;
    expect(confirmedCount).toBe(1);
  });

  it("does not confirm a second booking when the session is full — never exceeds capacity", async () => {
    refundCreateMock.mockClear();
    refundCreateMock.mockResolvedValue({ id: `re_test_${Date.now()}` });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("cap-exceed-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("cap-exceed-payer");
    await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_capexceed_${Date.now()}`,
        paymentIntentId: `pi_test_capexceed_${Date.now()}`,
        dropInSessionId: ctx.sessionId,
        userId: overflowUser.id,
        amountTotal: 1500,
      }),
    );

    const allRows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    const confirmedCount = allRows.filter((r) => r.status === "confirmed").length;
    expect(confirmedCount).toBe(1); // capacity is 1 — never 2
  });

  it("redelivery after a successful refund short-circuits without a second refund call", async () => {
    refundCreateMock.mockClear();
    const fakeRefundId = `re_test_redelivery_${Date.now()}`;
    refundCreateMock.mockResolvedValue({ id: fakeRefundId });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("redelivery-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("redelivery-payer");
    const paymentIntentId = `pi_test_redelivery_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_redelivery_${Date.now()}`,
      paymentIntentId,
      dropInSessionId: ctx.sessionId,
      userId: overflowUser.id,
      amountTotal: 1500,
    });

    const first = await handleDropInCheckoutComplete(checkoutSession);
    expect(first.status).toBe("overflow");
    expect(refundCreateMock).toHaveBeenCalledTimes(1);

    // Stripe redelivers the same webhook (at-least-once delivery).
    const second = await handleDropInCheckoutComplete(checkoutSession);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("duplicate webhook");
    // No retried-refund language — the refund had already succeeded.
    expect(second.reason).not.toContain("retried");
    expect(refundCreateMock).toHaveBeenCalledTimes(1);

    if (first.status !== "overflow") throw new Error("expected overflow");
    const row = await getBookingById(first.bookingId);
    expect(row.stripeRefundId).toBe(fakeRefundId);
  });

  it("redelivery after a FAILED refund retries the refund instead of skipping forever", async () => {
    refundCreateMock.mockClear();
    refundCreateMock.mockRejectedValueOnce(new Error("stripe network blip"));
    const fakeRefundId = `re_test_retry_${Date.now()}`;
    refundCreateMock.mockResolvedValueOnce({ id: fakeRefundId });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("retry-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("retry-payer");
    const paymentIntentId = `pi_test_retry_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_retry_${Date.now()}`,
      paymentIntentId,
      dropInSessionId: ctx.sessionId,
      userId: overflowUser.id,
      amountTotal: 1500,
    });

    const first = await handleDropInCheckoutComplete(checkoutSession);
    expect(first.status).toBe("overflow");
    if (first.status !== "overflow") throw new Error("expected overflow");

    let row = await getBookingById(first.bookingId);
    expect(row.status).toBe("waitlisted");
    expect(row.stripeRefundId).toBeNull(); // refund failed — not yet recorded
    expect(refundCreateMock).toHaveBeenCalledTimes(1);

    // Webhook redelivery — the row already exists (waitlisted, no refund
    // id yet), so the handler must retry the refund rather than silently
    // skip (which would strand a charged-but-unrefunded customer forever).
    const second = await handleDropInCheckoutComplete(checkoutSession);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("retried overflow refund");
    expect(refundCreateMock).toHaveBeenCalledTimes(2);
    expect(refundCreateMock).toHaveBeenNthCalledWith(
      2,
      { payment_intent: paymentIntentId },
      { idempotencyKey: `${paymentIntentId}:overflow-refund` },
    );

    // Only ONE booking row exists for this payment_intent — the retry
    // must not have inserted a second row.
    const matchingRows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.stripePaymentIntentId, paymentIntentId));
    expect(matchingRows).toHaveLength(1);

    row = await getBookingById(first.bookingId);
    expect(row.stripeRefundId).toBe(fakeRefundId);
  });
});

describe("promoteNextWaitlister honors waitlistPriority", () => {
  it("promotes a front-of-line (priority 100) row ahead of an earlier, default-priority waitlister", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 0,
      memberRateCents: 0,
    });

    const seatUser = await insertTestUser("prio-seat");
    const seatBooking = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: seatUser.id,
      source: "online_booking",
    });
    if (!seatBooking.ok) throw new Error("seat booking should be ok");

    // Voluntary waitlist join — default priority 0, created first.
    const early = await insertTestUser("prio-early");
    const [earlyRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: early.id,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        waitlistPriority: 0,
      })
      .returning();

    // Overflow-refund join — priority 100, created LATER than `early`.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const overflow = await insertTestUser("prio-overflow");
    const [overflowRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: overflow.id,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 1500,
        waitlistPriority: 100,
      })
      .returning();

    // Free the seat — the freed slot must go to the front-of-line row
    // despite `early` having joined the waitlist first.
    const cancelResult = await processCancelRefund(seatBooking.bookingId, {});
    expect(cancelResult.ok).toBe(true);
    expect(cancelResult.promotedNextBookingId).toBe(overflowRow.id);

    const promotedRow = await getBookingById(overflowRow.id);
    expect(promotedRow.status).toBe("pending_claim");
    expect(promotedRow.promotionToken).toBeTruthy();

    const earlyAfter = await getBookingById(earlyRow.id);
    expect(earlyAfter.status).toBe("waitlisted"); // still waiting, untouched

    // A second promotion (simulating the overflow claimant's window
    // lapsing) must reach `early` next.
    await getDb()
      .update(dropInBookings)
      .set({ status: "cancelled", promotionToken: null, updatedAt: new Date() })
      .where(eq(dropInBookings.id, overflowRow.id));
    const nextPromotion = await promoteNextWaitlister(ctx.sessionId);
    expect(nextPromotion.promoted).toBe(true);
    expect(nextPromotion.bookingId).toBe(earlyRow.id);
  });
});

describe("POST /api/kiosk/:locationSlug/walkin/start — capacity gate", () => {
  it("rejects with 409 when the session is already at capacity", async () => {
    const defaultOrg = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 1,
      sportOrClassLabel: `walkin-cap-full-${Date.now()}`,
    });

    const [venueRow] = await getDb()
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, ctx.venueId))
      .limit(1);
    expect(venueRow).toBeDefined();

    const seatUser = await insertTestUser("walkin-cap-seat");
    await insertConfirmedRow(ctx.sessionId, seatUser.id, 1700);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const res = await apiFetch(
      `/api/kiosk/${venueRow!.locationId}/walkin/start`,
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: ctx.sessionId,
          contact: {
            firstName: "Cap",
            lastName: `Full${suffix.slice(-4)}`,
            email: `cap-full-${suffix}@walkin-test.invalid`,
            phone: "6145550188",
            dob: "1990-01-01",
          },
        }),
      },
    );
    expect(res.status, await res.text()).toBe(409);

    // No hold row should have been created for the rejected attempt.
    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1); // only the seeded confirmed seat
  });
});
