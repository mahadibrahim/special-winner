/**
 * handleDropInClaimPayment — the fulfillment webhook for paying to confirm
 * a promoted overflow booking (see handle-dropin-claim-payment.ts and the
 * claim endpoint, api/dropin/claim/[token].ts).
 *
 * Library-level, mirrors tests/api/check-in/walkin-payment-webhook.test.ts:
 * rows are seeded directly in the exact state the claim flow produces —
 * pending_claim with the ORIGINAL PaymentIntent + its overflow refund
 * recorded — then the handler is driven with fake PaymentIntents.
 */
import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { handleDropInClaimPayment } from "@/lib/stripe/handle-dropin-claim-payment";
import { createTestDropInSession } from "../../utils/dropin-helpers";

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

/** A promoted overflow row in exactly the state the claim flow produces:
 *  pending_claim, original charge recorded, overflow refund recorded. */
async function seedPromotedOverflowRow(sessionId: string, userId: string) {
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "pending_claim",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
      waitlistPriority: 100,
      stripePaymentIntentId: `pi_test_original_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stripeRefundId: `re_test_original_${Date.now()}`,
      promotedAt: new Date(),
      promotionExpiresAt: new Date(Date.now() + 30 * 60_000),
      promotionToken: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    })
    .returning();
  return row;
}

function makeClaimPI(bookingId: string, piId: string, amount = 1545) {
  return {
    id: piId,
    metadata: { type: "dropin_claim_payment", booking_id: bookingId },
    amount_received: amount,
    amount,
  } as unknown as Stripe.PaymentIntent;
}

async function getBookingById(id: string) {
  const [row] = await getDb()
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.id, id));
  return row;
}

describe("handleDropInClaimPayment", () => {
  it("happy path: flips pending_claim to confirmed with the new payment; clears the stale refund marker and token", async () => {
    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const user = await insertTestUser("claim-wh-happy");
    const booking = await seedPromotedOverflowRow(ctx.sessionId, user.id);

    const claimPiId = `pi_test_claim_happy_${Date.now()}`;
    const result = await handleDropInClaimPayment(makeClaimPI(booking.id, claimPiId));

    expect(result.status).toBe("processed");
    if (result.status !== "processed") throw new Error("expected processed");
    expect(result.bookingId).toBe(booking.id);
    expect(result.paidCents).toBe(1545);

    const row = await getBookingById(booking.id);
    expect(row.status).toBe("confirmed");
    expect(row.amountPaidCents).toBe(1545);
    expect(row.stripePaymentIntentId).toBe(claimPiId);
    expect(row.stripeRefundId).toBeNull(); // stale overflow-refund marker cleared
    expect(row.promotionExpiresAt).toBeNull();
    expect(row.promotionToken).toBeNull();
  });

  it("redelivery of the same claim payment on a confirmed row skips without touching money", async () => {
    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const user = await insertTestUser("claim-wh-redeliver");
    const booking = await seedPromotedOverflowRow(ctx.sessionId, user.id);

    const claimPiId = `pi_test_claim_redeliver_${Date.now()}`;
    const pi = makeClaimPI(booking.id, claimPiId);

    const first = await handleDropInClaimPayment(pi);
    expect(first.status).toBe("processed");

    refundCreateMock.mockClear();
    const second = await handleDropInClaimPayment(pi);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("already confirmed by this payment");
    expect(refundCreateMock).not.toHaveBeenCalled();
  });

  it("sweep race: payment settles after the claim was cancelled → refunds the NEW charge exactly once (invariant: no paid-but-seatless customer)", async () => {
    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const user = await insertTestUser("claim-wh-swept");
    const booking = await seedPromotedOverflowRow(ctx.sessionId, user.id);
    const originalRefundId = booking.stripeRefundId;

    // The expiry sweep releases the claim while the customer's payment is
    // in flight (same transition expireOverduePromotions applies).
    await getDb()
      .update(dropInBookings)
      .set({
        status: "cancelled",
        cancellationReason: "expired_promotion",
        cancelledAt: new Date(),
        promotionToken: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, booking.id));

    const claimPiId = `pi_test_claim_swept_${Date.now()}`;
    const newRefundId = `re_test_claim_swept_${Date.now()}`;
    refundCreateMock.mockClear();
    refundCreateMock.mockResolvedValue({ id: newRefundId });

    const pi = makeClaimPI(booking.id, claimPiId);
    const result = await handleDropInClaimPayment(pi);

    expect(result.status).toBe("skipped");
    if (result.status !== "skipped") throw new Error("expected skipped");
    expect(result.reason).toContain("auto-refunded");
    expect(result.reason).toContain(newRefundId);

    // Refunded the NEW PaymentIntent — the row's pre-existing stripeRefundId
    // (from the original overflow refund) must NOT have short-circuited this,
    // which is exactly why this flow doesn't reuse the walk-in handler.
    expect(refundCreateMock).toHaveBeenCalledTimes(1);
    expect(refundCreateMock).toHaveBeenCalledWith(
      { payment_intent: claimPiId },
      { idempotencyKey: `${claimPiId}:claim-late-refund` },
    );

    const row = await getBookingById(booking.id);
    expect(row.status).toBe("cancelled");
    expect(row.stripePaymentIntentId).toBe(claimPiId);
    expect(row.stripeRefundId).toBe(newRefundId);
    expect(row.stripeRefundId).not.toBe(originalRefundId);

    // Redelivery after the refund is on record — durable marker short-circuits.
    const second = await handleDropInClaimPayment(pi);
    expect(second.status).toBe("skipped");
    if (second.status !== "skipped") throw new Error("expected skipped");
    expect(second.reason).toContain("already refunded");
    expect(refundCreateMock).toHaveBeenCalledTimes(1);
  });

  it("sweep race with a FAILED refund: alerts, leaves the row untouched so redelivery can retry", async () => {
    const ctx = await createTestDropInSession({ capacity: 1, sessionRateCents: 1500 });
    const user = await insertTestUser("claim-wh-sweptfail");
    const booking = await seedPromotedOverflowRow(ctx.sessionId, user.id);
    const originalPiId = booking.stripePaymentIntentId;
    const originalRefundId = booking.stripeRefundId;

    await getDb()
      .update(dropInBookings)
      .set({
        status: "cancelled",
        cancellationReason: "expired_promotion",
        cancelledAt: new Date(),
        promotionToken: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, booking.id));

    const claimPiId = `pi_test_claim_sweptfail_${Date.now()}`;
    refundCreateMock.mockClear();
    refundCreateMock.mockRejectedValueOnce(new Error("stripe boom"));
    const retryRefundId = `re_test_claim_retry_${Date.now()}`;
    refundCreateMock.mockResolvedValueOnce({ id: retryRefundId });

    const pi = makeClaimPI(booking.id, claimPiId);
    const failed = await handleDropInClaimPayment(pi);
    expect(failed.status).toBe("skipped");
    if (failed.status !== "skipped") throw new Error("expected skipped");
    expect(failed.reason).toContain("manual refund required");
    expect(failed.reason).toContain(claimPiId);

    // Row untouched: the original PI stays findable for the booking's
    // earlier events, and no false refund marker was written.
    let row = await getBookingById(booking.id);
    expect(row.stripePaymentIntentId).toBe(originalPiId);
    expect(row.stripeRefundId).toBe(originalRefundId);

    // Redelivery retries and succeeds this time.
    const retried = await handleDropInClaimPayment(pi);
    expect(retried.status).toBe("skipped");
    if (retried.status !== "skipped") throw new Error("expected skipped");
    expect(retried.reason).toContain("auto-refunded");
    expect(refundCreateMock).toHaveBeenCalledTimes(2);

    row = await getBookingById(booking.id);
    expect(row.stripePaymentIntentId).toBe(claimPiId);
    expect(row.stripeRefundId).toBe(retryRefundId);
  });

  it("skips when metadata has no booking_id or the booking does not exist", async () => {
    const noMeta = await handleDropInClaimPayment({
      id: "pi_claim_noop",
      metadata: {},
      amount_received: 0,
      amount: 0,
    } as unknown as Stripe.PaymentIntent);
    expect(noMeta.status).toBe("skipped");
    if (noMeta.status !== "skipped") throw new Error("expected skipped");
    expect(noMeta.reason).toBe("missing booking_id metadata");

    const notFound = await handleDropInClaimPayment(
      makeClaimPI("00000000-0000-0000-0000-000000000000", "pi_claim_notfound"),
    );
    expect(notFound.status).toBe("skipped");
    if (notFound.status !== "skipped") throw new Error("expected skipped");
    expect(notFound.reason).toContain("not found");
  });
});
