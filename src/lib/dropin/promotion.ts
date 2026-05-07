/**
 * Drop-in waitlist promotion + expiry.
 *
 * When a confirmed booking cancels (or a session-cancellation cascades
 * its waitlist), `promoteNextWaitlister(sessionId)` picks the oldest
 * waitlisted row, transitions it to `pending_claim`, and stamps a
 * cryptographically-random promotion token + expiry derived from the
 * org's rate-card `promotionWindowMinutes` (default 30).
 *
 * `expireOverduePromotions()` is the inverse: any pending_claim rows whose
 * window has elapsed are flipped to `cancelled` with reason
 * `expired_promotion`, and the next waitlister on each affected session
 * is promoted in turn.
 *
 * Both run inside DB transactions with row-level locking on the booking
 * being modified to keep concurrent cron ticks + cancellations safe.
 */
import crypto from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInBookings,
  dropInSessions,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";

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
  return await db.transaction(async (tx) => {
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

    // Lock the next waitlister row.
    const [next] = await tx
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionId),
          eq(dropInBookings.status, "waitlisted"),
        ),
      )
      .orderBy(asc(dropInBookings.createdAt))
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

    return {
      promoted: true,
      bookingId: next.id,
      userId: next.userId,
      sessionId,
      token,
      expiresAt,
    };
  });
}

export interface ExpireResult {
  expired: number;
  promotedNext: number;
}

export async function expireOverduePromotions(
  now: Date = new Date(),
): Promise<ExpireResult> {
  const db = getDb();

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

  let promotedNext = 0;
  for (const row of expiredRows) {
    const result = await promoteNextWaitlister(row.sessionId);
    if (result.promoted) promotedNext += 1;
  }

  return { expired: expiredRows.length, promotedNext };
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
