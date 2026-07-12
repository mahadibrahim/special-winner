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
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { promoteNextWaitlister } from "@/lib/dropin/promotion";
import { processCancelRefund } from "@/lib/dropin/refund";
import { handleDropInCheckoutComplete } from "@/lib/stripe/handle-dropin-checkout-complete";
import { handleDropInClaimPayment } from "@/lib/stripe/handle-dropin-claim-payment";
import { apiFetch, getAuthCookie, getParentCookie } from "../setup/test-helpers";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";

// Mock ONLY the stripe client's refunds.create — mirrors the pattern in
// tests/api/check-in/walkin-payment-webhook.test.ts. Everything else in
// handle-dropin-checkout-complete.ts is untouched. vi.mock is hoisted above
// the imports above at runtime, so handleDropInCheckoutComplete picks up
// the mocked client.
const { refundCreateMock, refundListMock } = vi.hoisted(() => ({
  refundCreateMock: vi.fn(),
  refundListMock: vi.fn(),
}));
vi.mock("@/lib/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/client")>();
  return {
    ...actual,
    stripe: { refunds: { create: refundCreateMock, list: refundListMock } },
  };
});

/** The error shape Stripe throws for a second full refund of the same
 *  charge — the discriminator the duplicate/self-heal paths key on. */
function alreadyRefundedError() {
  return Object.assign(new Error("Charge has already been refunded."), {
    code: "charge_already_refunded",
  });
}

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
    // stripeRefundId is set: only refund-SETTLED overflow rows are
    // promotable (unsettled ones are deliberately skipped — see the
    // dedicated refund-failure test below).
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
        stripePaymentIntentId: `pi_test_prio_${Date.now()}`,
        stripeRefundId: `re_test_prio_${Date.now()}`,
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

describe("refunded overflow claim requires payment (C1 regression)", () => {
  // The invariant set under test: a customer ends in exactly one of
  // paid-and-confirmed OR refunded-and-must-pay-to-confirm. An overflow
  // booking was REFUNDED when it was waitlisted — promoting it must not
  // hand the seat over for free just because amountPaidCents records the
  // (returned) original charge.
  it("full flow: overflow → refund settles → promote → claim REQUIRES payment → claim payment confirms", async () => {
    refundCreateMock.mockClear();
    const fakeRefundId = `re_test_c1_${Date.now()}`;
    refundCreateMock.mockResolvedValue({ id: fakeRefundId });

    // The overflow customer is the parent fixture user — the claim POST is
    // auth-gated to the booking's owner, and the parent is the only seeded
    // account this suite can sign in as over HTTP.
    const parentCookie = await getParentCookie();
    const [parentUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .limit(1);
    expect(parentUser).toBeDefined();

    // Session must live in the org that HTTP requests to localhost resolve
    // to — the claim endpoints are multi-tenant-guarded.
    const defaultOrg = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 1,
      sessionRateCents: 1500,
      sportOrClassLabel: `claim-pay-c1-${Date.now()}`,
    });

    // Someone else takes the only seat; the parent's paid Checkout then
    // completes → overflow: waitlisted front-of-line + auto-refunded.
    const seatHolder = await insertTestUser("c1-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const originalPiId = `pi_test_c1_${Date.now()}`;
    const overflowResult = await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_c1_${Date.now()}`,
        paymentIntentId: originalPiId,
        dropInSessionId: ctx.sessionId,
        userId: parentUser.id,
        amountTotal: 1500,
      }),
    );
    expect(overflowResult.status).toBe("overflow");
    if (overflowResult.status !== "overflow") throw new Error("expected overflow");

    // The seat frees up → the refund-settled overflow row is promoted.
    const seatRow = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    const seatBookingId = seatRow.find((r) => r.status === "confirmed")!.id;
    const cancel = await processCancelRefund(seatBookingId, {});
    expect(cancel.ok).toBe(true);
    expect(cancel.promotedNextBookingId).toBe(overflowResult.bookingId);

    const promoted = await getBookingById(overflowResult.bookingId);
    expect(promoted.status).toBe("pending_claim");
    expect(promoted.promotionToken).toBeTruthy();
    expect(promoted.stripeRefundId).toBe(fakeRefundId);
    const token = promoted.promotionToken!;

    // GET: the claim advertises that payment is required — NOT "already
    // paid" (the recorded amountPaidCents was refunded).
    const getRes = await apiFetch(`/api/dropin/claim/${token}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.paymentRequired).toBe(true);
    expect(getBody.amountDueCents).toBeGreaterThan(0);

    // POST (bare free-confirm) — REFUSED. This is the exact free-seat bug:
    // before the fix this flipped the row to confirmed without recharging.
    const freeConfirm = await apiFetch(`/api/dropin/claim/${token}`, {
      method: "POST",
      cookie: parentCookie,
    });
    expect(freeConfirm.status).toBe(422);
    const freeBody = await freeConfirm.json();
    expect(freeBody.paymentRequired).toBe(true);
    expect(freeBody.error).toMatch(/refunded/i);

    const stillPending = await getBookingById(overflowResult.bookingId);
    expect(stillPending.status).toBe("pending_claim"); // NOT confirmed

    // Claim payment settles (fulfillment rides payment_intent.succeeded →
    // handleDropInClaimPayment; the checkout minting itself needs a live
    // Stripe client and is exercised at the endpoint level in dev/staging).
    const claimPiId = `pi_test_c1_claim_${Date.now()}`;
    const paid = await handleDropInClaimPayment({
      id: claimPiId,
      metadata: { type: "dropin_claim_payment", booking_id: overflowResult.bookingId },
      amount_received: 1545,
      amount: 1545,
    } as unknown as Stripe.PaymentIntent);
    expect(paid.status).toBe("processed");

    const confirmed = await getBookingById(overflowResult.bookingId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.amountPaidCents).toBe(1545);
    expect(confirmed.stripePaymentIntentId).toBe(claimPiId);
    // The stale refund marker belongs to the ORIGINAL payment — cleared so
    // the row doesn't lie about its live charge.
    expect(confirmed.stripeRefundId).toBeNull();
    expect(confirmed.promotionToken).toBeNull();
    expect(confirmed.promotionExpiresAt).toBeNull();
  });
});

describe("unsettled overflow refunds block promotion (I1)", () => {
  it("refund fails → row NOT promoted while a later priority-0 waitlister is → redelivery refunds → row promotable", async () => {
    refundCreateMock.mockClear();
    refundCreateMock.mockRejectedValueOnce(new Error("stripe outage"));
    const fakeRefundId = `re_test_i1_${Date.now()}`;
    refundCreateMock.mockResolvedValueOnce({ id: fakeRefundId });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("i1-seatholder");
    const seatRow = await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    // Overflow whose refund FAILS — charged, waitlisted, NOT refunded.
    const overflowUser = await insertTestUser("i1-overflow");
    const paymentIntentId = `pi_test_i1_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_i1_${Date.now()}`,
      paymentIntentId,
      dropInSessionId: ctx.sessionId,
      userId: overflowUser.id,
      amountTotal: 1500,
    });
    const overflowResult = await handleDropInCheckoutComplete(checkoutSession);
    expect(overflowResult.status).toBe("overflow");
    if (overflowResult.status !== "overflow") throw new Error("expected overflow");
    let overflowRow = await getBookingById(overflowResult.bookingId);
    expect(overflowRow.stripeRefundId).toBeNull();

    // A voluntary waitlister joins LATER at priority 0.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const voluntary = await insertTestUser("i1-voluntary");
    const [voluntaryRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: voluntary.id,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        waitlistPriority: 0,
      })
      .returning();

    // Seat frees → promotion must SKIP the unsettled overflow row (its
    // payment is still held and scheduled for the redelivery-retry refund;
    // promoting it would both hand out a claim against doomed money AND
    // move it out of `waitlisted`, the status the retry branch matches).
    const cancel = await processCancelRefund(seatRow.id, {});
    expect(cancel.ok).toBe(true);
    expect(cancel.promotedNextBookingId).toBe(voluntaryRow.id);

    overflowRow = await getBookingById(overflowResult.bookingId);
    expect(overflowRow.status).toBe("waitlisted"); // skipped, still waiting

    // Webhook redelivery retries the refund — and the row must still be in
    // the status the retry branch matches (waitlisted).
    const redelivery = await handleDropInCheckoutComplete(checkoutSession);
    expect(redelivery.status).toBe("skipped");
    if (redelivery.status !== "skipped") throw new Error("expected skipped");
    expect(redelivery.reason).toContain("retried overflow refund");

    overflowRow = await getBookingById(overflowResult.bookingId);
    expect(overflowRow.stripeRefundId).toBe(fakeRefundId);

    // With the refund settled the row is promotable again — it's the only
    // remaining waitlisted row, and the promotion no longer skips it.
    const promo = await promoteNextWaitlister(ctx.sessionId);
    expect(promo.promoted).toBe(true);
    expect(promo.bookingId).toBe(overflowResult.bookingId);
  });
});

describe("original-checkout redelivery after a claim payment (duplicate-user guard)", () => {
  it("skips without inserting a duplicate row once the claim payment replaced the row's PaymentIntent", async () => {
    refundCreateMock.mockClear();
    refundCreateMock.mockResolvedValue({ id: `re_test_guard_${Date.now()}` });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("guard-seatholder");
    const seatRow = await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("guard-overflow");
    const originalPiId = `pi_test_guard_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_guard_${Date.now()}`,
      paymentIntentId: originalPiId,
      dropInSessionId: ctx.sessionId,
      userId: overflowUser.id,
      amountTotal: 1500,
    });
    const overflowResult = await handleDropInCheckoutComplete(checkoutSession);
    expect(overflowResult.status).toBe("overflow");
    if (overflowResult.status !== "overflow") throw new Error("expected overflow");

    // Seat frees → refund-settled row promotes → claim payment confirms it
    // (replacing the row's stripePaymentIntentId with the claim PI).
    await processCancelRefund(seatRow.id, {});
    const claimPiId = `pi_test_guard_claim_${Date.now()}`;
    const paid = await handleDropInClaimPayment({
      id: claimPiId,
      metadata: { type: "dropin_claim_payment", booking_id: overflowResult.bookingId },
      amount_received: 1545,
      amount: 1545,
    } as unknown as Stripe.PaymentIntent);
    expect(paid.status).toBe("processed");

    const rowCountBefore = (
      await getDb()
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.sessionId, ctx.sessionId))
    ).length;

    // Redelivery of the ORIGINAL checkout event: its PI is no longer on any
    // row (the claim payment replaced it), so the PI-based dedupe misses —
    // the duplicate-user guard must catch it before it re-inserts. The
    // guard's refund attempt is refused by Stripe (this PI was already
    // refunded by the overflow path) → quiet redelivery skip.
    refundCreateMock.mockClear();
    refundCreateMock.mockRejectedValueOnce(alreadyRefundedError());
    const redelivery = await handleDropInCheckoutComplete(checkoutSession);
    expect(redelivery.status).toBe("skipped");
    if (redelivery.status !== "skipped") throw new Error("expected skipped");
    expect(redelivery.reason).toContain("already has an active booking");
    expect(redelivery.reason).toContain("already refunded");

    const rowsAfter = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rowsAfter).toHaveLength(rowCountBefore); // no duplicate row
    const confirmed = rowsAfter.filter((r) => r.status === "confirmed");
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].id).toBe(overflowResult.bookingId);
    expect(confirmed[0].stripePaymentIntentId).toBe(claimPiId);
  });
});

describe("paid-mint duplicate pre-check (POST /api/dropin/bookings)", () => {
  it("409s a paid booking attempt when the user already holds an active booking — before any Checkout Session is minted", async () => {
    const parentCookie = await getParentCookie();
    const [parentUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .limit(1);
    expect(parentUser).toBeDefined();

    const defaultOrg = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 10,
      sessionRateCents: 1500,
      sportOrClassLabel: `dup-premint-${Date.now()}`,
    });

    // Existing kiosk hold for the same user — the "other tab / other
    // channel" state a second paid checkout would double-charge.
    await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: parentUser.id,
        status: "pending_payment",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: new Date(Date.now() + 2 * 3_600_000),
      });

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        waiverAccepted: true,
        waiverName: "Parent Tester",
      }),
    });
    expect(res.status, await res.clone().text()).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("already_booked");
  });
});

describe("duplicate paid checkout at the webhook (duplicate-user guard branches)", () => {
  it("LIVE duplicate: refunds the second charge exactly once with the duplicate-refund key", async () => {
    refundCreateMock.mockClear();
    const dupRefundId = `re_test_dup_${Date.now()}`;
    refundCreateMock.mockResolvedValueOnce({ id: dupRefundId });

    // Session NOT full — the duplicate-user guard, not the capacity gate,
    // must be what stops the insert.
    const ctx = await createTestDropInSession({ capacity: 10, sessionRateCents: 1500 });
    const user = await insertTestUser("dup-live");
    await insertConfirmedRow(ctx.sessionId, user.id, 1500);

    const dupPiId = `pi_test_dup_${Date.now()}`;
    const result = await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_dup_${Date.now()}`,
        paymentIntentId: dupPiId,
        dropInSessionId: ctx.sessionId,
        userId: user.id,
        amountTotal: 1500,
      }),
    );

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("already has an active booking");
    expect(result.reason).toContain(`auto-refunded (${dupRefundId})`);

    expect(refundCreateMock).toHaveBeenCalledTimes(1);
    expect(refundCreateMock).toHaveBeenCalledWith(
      { payment_intent: dupPiId },
      { idempotencyKey: `${dupPiId}:duplicate-refund` },
    );

    // No second row was inserted.
    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1);
  });

  it("never refunds the active row's OWN PaymentIntent (ledger fail-open redelivery)", async () => {
    refundCreateMock.mockClear();

    const ctx = await createTestDropInSession({ capacity: 10, sessionRateCents: 1500 });
    const user = await insertTestUser("dup-own-pi");
    const piId = `pi_test_ownpi_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_ownpi_${Date.now()}`,
      paymentIntentId: piId,
      dropInSessionId: ctx.sessionId,
      userId: user.id,
      amountTotal: 1500,
    });

    // First delivery seats the customer normally.
    const first = await handleDropInCheckoutComplete(checkoutSession);
    expect(first.status).toBe("processed");

    // Replay the exact same event. Serially the pre-tx PI dedupe catches
    // this; the guard's own-PI check (activeForUser.stripePaymentIntentId
    // === incoming PI → quiet skip) is the backstop for the interleaving a
    // serial test cannot stage — two concurrent deliveries both passing the
    // pre-tx check before either inserts. This test pins the invariant the
    // two layers jointly guarantee: replaying a seated customer's event
    // NEVER refunds their live payment and NEVER duplicates their row,
    // whichever layer catches it.
    const second = await handleDropInCheckoutComplete(checkoutSession);
    expect(second.status).toBe("skipped");
    expect(refundCreateMock).not.toHaveBeenCalled();

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].stripeRefundId).toBeNull();
  });

  it("redelivery: an already-refunded charge is skipped quietly without a refund", async () => {
    refundCreateMock.mockClear();
    refundCreateMock.mockRejectedValueOnce(alreadyRefundedError());

    const ctx = await createTestDropInSession({ capacity: 10, sessionRateCents: 1500 });
    const user = await insertTestUser("dup-redeliver");
    await insertConfirmedRow(ctx.sessionId, user.id, 1500);

    const result = await handleDropInCheckoutComplete(
      makeDropinCheckoutSession({
        checkoutSessionId: `cs_test_dupre_${Date.now()}`,
        paymentIntentId: `pi_test_dupre_${Date.now()}`,
        dropInSessionId: ctx.sessionId,
        userId: user.id,
        amountTotal: 1500,
      }),
    );

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("already has an active booking");
    expect(result.reason).toContain("already refunded");
    expect(result.reason).not.toContain("auto-refunded (");
    expect(refundCreateMock).toHaveBeenCalledTimes(1); // the refused attempt

    const rows = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    expect(rows).toHaveLength(1);
  });
});

describe("overflow refund retry self-heals an out-of-band refund", () => {
  it("charge_already_refunded on retry → resolves the settled refund, stamps the row, row becomes promotable", async () => {
    refundCreateMock.mockClear();
    refundListMock.mockClear();
    // First delivery: refund fails outright (network) → row unrefunded.
    refundCreateMock.mockRejectedValueOnce(new Error("stripe outage"));
    // Redelivery: Stripe now refuses — staff refunded out-of-band in the
    // dashboard in the meantime. The retry must self-heal by resolving the
    // settled refund and stamping it.
    refundCreateMock.mockRejectedValueOnce(alreadyRefundedError());
    const oobRefundId = `re_test_oob_${Date.now()}`;
    refundListMock.mockResolvedValueOnce({ data: [{ id: oobRefundId }] });

    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const seatHolder = await insertTestUser("oob-seatholder");
    await insertConfirmedRow(ctx.sessionId, seatHolder.id, 1500);

    const overflowUser = await insertTestUser("oob-overflow");
    const paymentIntentId = `pi_test_oob_${Date.now()}`;
    const checkoutSession = makeDropinCheckoutSession({
      checkoutSessionId: `cs_test_oob_${Date.now()}`,
      paymentIntentId,
      dropInSessionId: ctx.sessionId,
      userId: overflowUser.id,
      amountTotal: 1500,
    });

    const first = await handleDropInCheckoutComplete(checkoutSession);
    expect(first.status).toBe("overflow");
    if (first.status !== "overflow") throw new Error("expected overflow");
    let row = await getBookingById(first.bookingId);
    expect(row.stripeRefundId).toBeNull();

    const redelivery = await handleDropInCheckoutComplete(checkoutSession);
    expect(redelivery.status).toBe("skipped");
    expect(refundListMock).toHaveBeenCalledWith({
      payment_intent: paymentIntentId,
      limit: 1,
    });

    row = await getBookingById(first.bookingId);
    expect(row.stripeRefundId).toBe(oobRefundId); // stamped from the PI's settled refund
    expect(row.status).toBe("waitlisted");

    // Settled marker in place → the row is promotable again.
    const promo = await promoteNextWaitlister(ctx.sessionId);
    expect(promo.promoted).toBe(true);
    expect(promo.bookingId).toBe(first.bookingId);
  });
});

describe("zero-due claim (membership gained after the overflow refund)", () => {
  it("pay action confirms directly with the membership payment method — no Stripe session", async () => {
    const email = "adult-self@test.aspiresports.com";
    const cookie = await getAuthCookie(email, "TestParent123!");
    const db = getDb();
    const [selfUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(selfUser).toBeDefined();

    const defaultOrg = await resolveDefaultOrgForHttpTests();

    // Clean slate on the shared CI DB: the partial unique index
    // memberships_one_active_per_user_org allows only one active membership
    // per user+org, and a leaked row from a past run would break the insert.
    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.userId, selfUser.id),
          eq(memberships.organizationId, defaultOrg.organizationId),
        ),
      );

    // Unlimited-pickup membership gained between the overflow refund and
    // the claim. Cleaned up in finally — other suites resolve rates for
    // this fixture user in the same org.
    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId: defaultOrg.organizationId,
        name: `zero-due-test-${Date.now()}`,
        monthlyPriceCents: 5000,
        benefits: { unlimited_pickup: true },
      })
      .returning();
    const [membershipRow] = await db
      .insert(memberships)
      .values({
        userId: selfUser.id,
        organizationId: defaultOrg.organizationId,
        tierId: tier.id,
        status: "active",
        billingInterval: "month",
      })
      .returning();

    try {
      const ctx = await createTestDropInSession({
        organizationId: defaultOrg.organizationId,
        venueId: defaultOrg.venueId,
        capacity: 5,
        sessionRateCents: 1500,
        sportOrClassLabel: `zero-due-claim-${Date.now()}`,
      });

      // A promoted refunded-overflow row for this user (the exact state the
      // claim-pay action sees).
      const token = `tok_zero_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const [claimRow] = await db
        .insert(dropInBookings)
        .values({
          sessionId: ctx.sessionId,
          userId: selfUser.id,
          status: "pending_claim",
          source: "online_booking",
          paymentMethod: "card_online",
          amountPaidCents: 1500,
          waitlistPriority: 100,
          stripePaymentIntentId: `pi_test_zero_${Date.now()}`,
          stripeRefundId: `re_test_zero_${Date.now()}`,
          promotedAt: new Date(),
          promotionExpiresAt: new Date(Date.now() + 30 * 60_000),
          promotionToken: token,
        })
        .returning();

      // GET reflects the zero amount due.
      const getRes = await apiFetch(`/api/dropin/claim/${token}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.paymentRequired).toBe(true);
      expect(getBody.amountDueCents).toBe(0);

      // Bare free-confirm is still refused (payment discriminator, not
      // amount, gates the free path).
      const bare = await apiFetch(`/api/dropin/claim/${token}`, {
        method: "POST",
        cookie,
      });
      expect(bare.status).toBe(422);

      // Pay action: nothing to charge → direct confirm, no checkoutUrl.
      const pay = await apiFetch(`/api/dropin/claim/${token}`, {
        method: "POST",
        cookie,
        body: JSON.stringify({ action: "pay" }),
      });
      expect(pay.status, await pay.clone().text()).toBe(200);
      const payBody = await pay.json();
      expect(payBody.ok).toBe(true);
      expect(payBody.checkoutUrl).toBeUndefined();

      const confirmed = await getBookingById(claimRow.id);
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.paymentMethod).toBe("member_unlimited");
      expect(confirmed.membershipId).toBe(membershipRow.id);
      expect(confirmed.amountPaidCents).toBe(0);
      expect(confirmed.promotionToken).toBeNull();
    } finally {
      await db.delete(memberships).where(eq(memberships.id, membershipRow.id));
      await db.delete(membershipTiers).where(eq(membershipTiers.id, tier.id));
    }
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
