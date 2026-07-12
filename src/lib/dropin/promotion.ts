/**
 * Drop-in waitlist promotion + expiry.
 *
 * When a confirmed booking cancels (or a session-cancellation cascades
 * its waitlist), `promoteNextWaitlister(sessionId)` picks the oldest
 * waitlisted row, transitions it to `pending_claim`, and stamps a
 * cryptographically-random promotion token + expiry derived from the
 * org's rate-card `promotionWindowMinutes` (default 30).
 *
 * `expireOverduePromotions()` sweeps THREE kinds of stale holds, all
 * feeding the same `promoteNextWaitlister` loop so a freed slot is always
 * offered to the next waitlister on that session:
 *
 *   1. Overdue waitlist promotions — `pending_claim` rows whose
 *      `promotionExpiresAt` has elapsed — flipped to `cancelled` with
 *      reason `expired_promotion`.
 *   2. Overdue walk-in payment holds — `pending_payment` rows (see
 *      src/pages/api/kiosk/[locationSlug]/walkin/start.ts) whose
 *      `promotionExpiresAt` (set to `createdAt + WALK_IN_HOLD_TTL_MS` at
 *      creation) has elapsed — flipped to `cancelled` with reason
 *      `expired_payment_hold`.
 *   3. Legacy stranded walk-in holds — `pending_claim` rows with
 *      `promotionExpiresAt IS NULL` and `createdAt` older than
 *      `WALK_IN_HOLD_TTL_MS`. These predate the `pending_payment` status
 *      (no SQL backfill was possible — see the "no-SQL-backfill amendment"
 *      in docs/superpowers/plans/2026-07-12-walkin-remote-payment.md) and
 *      will never be converted by a migration, so the sweep treats them
 *      exactly like a payment hold: `cancelled` with reason
 *      `expired_payment_hold`. Once the branch has been live for
 *      `WALK_IN_HOLD_TTL_MS`, every remaining `pending_claim` row is a
 *      genuine promotion (has a non-null `promotionExpiresAt`), so this
 *      branch goes quiet but stays as a permanent guard.
 *
 * Both `promoteNextWaitlister` and `expireOverduePromotions` run inside DB
 * transactions with row-level locking on the booking being modified to
 * keep concurrent cron ticks + cancellations safe.
 */
import crypto from "node:crypto";
import { and, asc, desc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInBookings,
  dropInSessions,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { dispatchWaitlistPromoted } from "./messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { WALK_IN_HOLD_TTL_MS } from "@/pages/api/kiosk/[locationSlug]/walkin/start";

export interface PromotionResult {
  promoted: boolean;
  bookingId?: string;
  userId?: string;
  sessionId?: string;
  token?: string;
  expiresAt?: Date;
}

const DEFAULT_PROMOTION_WINDOW_MINUTES = 30;

export async function promoteNextWaitlister(
  sessionId: string,
): Promise<PromotionResult> {
  const db = getDb();
  const promotionResult = await db.transaction(
    async (tx): Promise<PromotionResult> => {
    // Fetch the session's org so we can read the rate card's promotion window.
    const [sessionRow] = await tx
      .select({ organizationId: dropInSessions.organizationId })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionId))
      .limit(1);
    if (!sessionRow) return { promoted: false };

    const [rateCard] = await tx
      .select({ promotionWindowMinutes: dropInRateCard.promotionWindowMinutes })
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, sessionRow.organizationId))
      .limit(1);
    const windowMinutes =
      rateCard?.promotionWindowMinutes ?? DEFAULT_PROMOTION_WINDOW_MINUTES;

    // Lock the next waitlister row. Front-of-line first (waitlistPriority
    // DESC — the transactional capacity gate's overflow-refund path stamps
    // 100 on a customer who already paid and got squeezed out by the
    // last-spot race; a voluntary waitlist join stays at the default 0),
    // then oldest-first (createdAt ASC) as the tiebreaker within a
    // priority tier so FIFO still holds among equals.
    //
    // SKIP unsettled overflow rows: an overflow booking (priority >= 100)
    // whose charge is still held (amountPaidCents > 0) with no refund on
    // record (stripeRefundId IS NULL) is in the refund-failed/refund-pending
    // state. Promoting it would (1) let the claim path confirm a seat on
    // the strength of a payment that the webhook-redelivery retry is about
    // to refund, and (2) move the row out of `waitlisted` — the exact
    // status the retry branch in handle-dropin-checkout-complete.ts
    // matches — so the retry would skip forever and strand the charge.
    // The row stays waitlisted until the redelivered webhook settles the
    // refund and stamps stripeRefundId; then it becomes promotable.
    const [next] = await tx
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.status, "waitlisted"),
          sql`NOT (${dropInBookings.amountPaidCents} > 0 AND ${dropInBookings.stripeRefundId} IS NULL AND ${dropInBookings.waitlistPriority} >= 100)`,
        ),
      )
      .orderBy(desc(dropInBookings.waitlistPriority), asc(dropInBookings.createdAt))
      .limit(1)
      .for("update");
    if (!next) return { promoted: false };

    const expiresAt = new Date(Date.now() + windowMinutes * 60_000);
    const token = crypto.randomBytes(32).toString("base64url");

    await tx
      .update(dropInBookings)
      .set({
        status: "pending_claim",
        promotedAt: new Date(),
        promotionExpiresAt: expiresAt,
        promotionToken: token,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, next.id));

    const result: PromotionResult = {
      promoted: true,
      bookingId: next.id,
      userId: next.userId,
      sessionId,
      token,
      expiresAt,
    };

    // Claim notification is dispatched after the tx commits (see below) — an
    // un-awaited send here is dropped when the serverless function freezes.

    return result;
  });

  // Awaited so the send completes before the function freezes; outside the tx
  // so a messaging failure can't roll back the promotion. Logged, not thrown.
  if (
    promotionResult.promoted &&
    promotionResult.bookingId &&
    promotionResult.token &&
    promotionResult.expiresAt
  ) {
    const bookingId = promotionResult.bookingId;
    const token = promotionResult.token;
    const expiresAt = promotionResult.expiresAt;
    await awaitDispatch(
      "dropin waitlist-promoted",
      () => dispatchWaitlistPromoted(bookingId, token, expiresAt),
      { bookingId },
    );
  }
  return promotionResult;
}

export interface ExpireResult {
  expired: number;
  expiredPaymentHolds: number;
  promotedNext: number;
}

export async function expireOverduePromotions(
  now: Date = new Date(),
): Promise<ExpireResult> {
  const db = getDb();

  // 1. Overdue waitlist promotions.
  const expiredRows = await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "expired_promotion",
      cancelledAt: now,
      promotionToken: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(dropInBookings.status, "pending_claim"),
        lte(dropInBookings.promotionExpiresAt, now),
      ),
    )
    .returning({ id: dropInBookings.id, sessionId: dropInBookings.sessionId });

  // 2. Overdue walk-in payment holds.
  const expiredHolds = await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "expired_payment_hold",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(dropInBookings.status, "pending_payment"),
        lte(dropInBookings.promotionExpiresAt, now),
      ),
    )
    .returning({ id: dropInBookings.id, sessionId: dropInBookings.sessionId });

  // 3. Legacy stranded walk-in holds: pre-payment-build pending_claim rows
  // that never got a promotionExpiresAt because no migration backfill was
  // possible (see the module doc header). Treated exactly like a payment
  // hold once older than the same TTL.
  const legacyCutoff = new Date(now.getTime() - WALK_IN_HOLD_TTL_MS);
  const expiredLegacyHolds = await db
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "expired_payment_hold",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(dropInBookings.status, "pending_claim"),
        isNull(dropInBookings.promotionExpiresAt),
        lt(dropInBookings.createdAt, legacyCutoff),
      ),
    )
    .returning({ id: dropInBookings.id, sessionId: dropInBookings.sessionId });

  const allExpiredRows = [
    ...expiredRows,
    ...expiredHolds,
    ...expiredLegacyHolds,
  ];

  let promotedNext = 0;
  for (const row of allExpiredRows) {
    const result = await promoteNextWaitlister(row.sessionId);
    if (result.promoted) promotedNext += 1;
  }

  return {
    expired: expiredRows.length,
    expiredPaymentHolds: expiredHolds.length + expiredLegacyHolds.length,
    promotedNext,
  };
}

/**
 * Constant-time-ish token verification helper. Looks up a pending_claim
 * row that still owns this token and whose window hasn't elapsed.
 */
export async function findClaimByToken(token: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.promotionToken, token),
        eq(dropInBookings.status, "pending_claim"),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.promotionExpiresAt && row.promotionExpiresAt < new Date()) {
    return { ...row, expired: true as const };
  }
  return { ...row, expired: false as const };
}
