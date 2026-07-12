/**
 * POST /api/cron/expire-pending-claims — expiry sweep branches.
 *
 * `expireOverduePromotions` (src/lib/dropin/promotion.ts) sweeps three
 * kinds of stale drop-in booking rows, each feeding the same
 * `promoteNextWaitlister` loop:
 *
 *   1. Overdue waitlist promotions (`pending_claim` + elapsed
 *      `promotionExpiresAt`) — pre-existing behavior, regression-tested
 *      here end-to-end via the cron endpoint (previously only exercised
 *      at the library level in full-flow.test.ts, and only smoke-tested
 *      over HTTP in claim.test.ts with no seeded expired rows).
 *   2. Overdue walk-in payment holds (`pending_payment` + elapsed
 *      `promotionExpiresAt`) — new in the walk-in remote payment work.
 *   3. Legacy stranded walk-in holds (`pending_claim` with
 *      `promotionExpiresAt IS NULL` and `createdAt` older than the walk-in
 *      hold TTL) — pre-payment-build rows that no migration backfill will
 *      ever convert (see the "no-SQL-backfill amendment" in
 *      docs/superpowers/plans/2026-07-12-walkin-remote-payment.md).
 *
 * Each test seeds rows directly via drizzle (mirroring the pattern in
 * tests/api/dropin/full-flow.test.ts) rather than driving the full
 * kiosk/waitlist HTTP flows, then force-expires the target row and hits
 * the cron endpoint with CRON_SECRET, asserting on DB end-state. Counts
 * returned by the cron endpoint are asserted with >= rather than exact
 * equality — the endpoint sweeps the whole table, not just this test's
 * rows, and other suites running in the same DB may also have overdue
 * rows in flight.
 */
import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { processCancelRefund } from "@/lib/dropin/refund";
import { WALK_IN_HOLD_TTL_MS } from "@/pages/api/kiosk/[locationSlug]/walkin/start";

const CRON_ENDPOINT = "/api/cron/expire-pending-claims";

async function runCron() {
  const secret = process.env.CRON_SECRET ?? "";
  const res = await apiFetch(CRON_ENDPOINT, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  return expectJson(res, 200);
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

async function insertWaitlistedRow(sessionId: string, userId: string) {
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "waitlisted",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 0,
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

describe("expireOverduePromotions: overdue pending_payment walk-in holds", () => {
  it("expires an overdue payment hold and promotes the next waitlister into the freed slot", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 1500,
    });

    const holder = await insertTestUser("hold-holder");
    const [holdRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: holder.id,
        status: "pending_payment",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        // Created "on time" but already past its expiry — mirrors
        // walkin/start's insert shape, force-expired below.
        promotionExpiresAt: new Date(Date.now() + WALK_IN_HOLD_TTL_MS),
      })
      .returning();

    const waiter = await insertTestUser("hold-waiter");
    const waitRow = await insertWaitlistedRow(ctx.sessionId, waiter.id);

    // Force-expire the hold.
    await getDb()
      .update(dropInBookings)
      .set({ promotionExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(dropInBookings.id, holdRow.id));

    const json = await runCron();
    expect(json.expiredPaymentHolds).toBeGreaterThanOrEqual(1);
    expect(json.promotedNext).toBeGreaterThanOrEqual(1);

    const afterHold = await getBookingById(holdRow.id);
    expect(afterHold.status).toBe("cancelled");
    expect(afterHold.cancellationReason).toBe("expired_payment_hold");
    expect(afterHold.cancelledAt).not.toBeNull();

    const afterWait = await getBookingById(waitRow.id);
    expect(afterWait.status).toBe("pending_claim");
    expect(afterWait.promotionToken).toBeTruthy();
    expect(afterWait.promotionExpiresAt).toBeTruthy();
  });

  it("leaves a payment hold with a future expiry untouched", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 1500,
    });
    const holder = await insertTestUser("hold-not-yet");
    const [holdRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: holder.id,
        status: "pending_payment",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: new Date(Date.now() + WALK_IN_HOLD_TTL_MS),
      })
      .returning();

    await runCron();

    const after = await getBookingById(holdRow.id);
    expect(after.status).toBe("pending_payment");
    expect(after.cancellationReason).toBeNull();
  });
});

describe("expireOverduePromotions: legacy stranded pending_claim holds (promotionExpiresAt IS NULL)", () => {
  it("expires a legacy stranded hold older than the walk-in TTL and promotes the next waitlister", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 1200,
    });

    const holder = await insertTestUser("legacy-holder");
    const staleCreatedAt = new Date(Date.now() - WALK_IN_HOLD_TTL_MS - 5 * 60_000);
    const [legacyRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: holder.id,
        status: "pending_claim",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: null,
        createdAt: staleCreatedAt,
      })
      .returning();

    const waiter = await insertTestUser("legacy-waiter");
    const waitRow = await insertWaitlistedRow(ctx.sessionId, waiter.id);

    const json = await runCron();
    expect(json.expiredPaymentHolds).toBeGreaterThanOrEqual(1);
    expect(json.promotedNext).toBeGreaterThanOrEqual(1);

    const afterLegacy = await getBookingById(legacyRow.id);
    expect(afterLegacy.status).toBe("cancelled");
    expect(afterLegacy.cancellationReason).toBe("expired_payment_hold");
    expect(afterLegacy.cancelledAt).not.toBeNull();

    const afterWait = await getBookingById(waitRow.id);
    expect(afterWait.status).toBe("pending_claim");
    expect(afterWait.promotionToken).toBeTruthy();
  });

  it("does not expire a recent pending_claim row with a null expiry (younger than the TTL)", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 1200,
    });
    const holder = await insertTestUser("legacy-too-young");
    const [recentRow] = await getDb()
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: holder.id,
        status: "pending_claim",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 0,
        promotionExpiresAt: null,
        // Well within the TTL window — must survive the sweep.
        createdAt: new Date(Date.now() - 5 * 60_000),
      })
      .returning();

    await runCron();

    const after = await getBookingById(recentRow.id);
    expect(after.status).toBe("pending_claim");
    expect(after.cancellationReason).toBeNull();
  });
});

describe("expireOverduePromotions: overdue waitlist promotions (regression)", () => {
  it("still expires an overdue promotion-claim (with token + expiry) and promotes the next waitlister", async () => {
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 0,
      memberRateCents: 0,
    });

    const holder = await insertTestUser("promo-regression-holder");
    const confirmed = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: holder.id,
      source: "online_booking",
    });
    if (!confirmed.ok) throw new Error("confirmed booking should be ok");

    const waiterA = await insertTestUser("promo-regression-waiter-a");
    const waitRowA = await insertWaitlistedRow(ctx.sessionId, waiterA.id);

    // Cancelling the confirmed booking promotes waiterA to pending_claim
    // with a real token + promotion window.
    const cancel = await processCancelRefund(confirmed.bookingId, {});
    expect(cancel.ok).toBe(true);
    expect(cancel.promotedNextBookingId).toBe(waitRowA.id);

    const promotedRow = await getBookingById(waitRowA.id);
    expect(promotedRow.status).toBe("pending_claim");
    expect(promotedRow.promotionToken).toBeTruthy();

    // Force-expire the promotion window.
    await getDb()
      .update(dropInBookings)
      .set({ promotionExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(dropInBookings.id, waitRowA.id));

    // A second waitlister should be promoted into the slot vacated by A.
    const waiterB = await insertTestUser("promo-regression-waiter-b");
    const waitRowB = await insertWaitlistedRow(ctx.sessionId, waiterB.id);

    const json = await runCron();
    expect(json.expired).toBeGreaterThanOrEqual(1);
    expect(json.promotedNext).toBeGreaterThanOrEqual(1);

    const afterA = await getBookingById(waitRowA.id);
    expect(afterA.status).toBe("cancelled");
    expect(afterA.cancellationReason).toBe("expired_promotion");
    expect(afterA.promotionToken).toBeNull();

    const afterB = await getBookingById(waitRowB.id);
    expect(afterB.status).toBe("pending_claim");
    expect(afterB.promotionToken).toBeTruthy();
  });
});
