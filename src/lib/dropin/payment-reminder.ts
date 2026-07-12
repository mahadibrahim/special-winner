/**
 * One-shot payment reminder for walk-in payment holds.
 *
 * `sendDuePaymentReminders` runs as part of the cron expiry sweep
 * (src/pages/api/cron/expire-pending-claims.ts), called BEFORE
 * `expireOverduePromotions` so a hold expiring within the same tick still
 * got its reminder attempt (acceptable ordering — see the plan's Task 4
 * step 3). It selects `pending_payment` rows whose `promotionExpiresAt`
 * falls within the next 30 minutes, haven't been reminded yet, STAMPS
 * `reminderSentAt` FIRST in a single `UPDATE ... RETURNING` (the atomicity
 * boundary — see the query's inline comment), then dispatches one message
 * per stamped row via `dispatchPaymentReminder`, logged-not-thrown through
 * `awaitDispatch` (same pattern as promotion.ts's promoteNextWaitlister).
 *
 * Self-serve link: reuses the booking's live `walkin_session` token if one
 * exists — `mintToken` (src/lib/check-in/tokens-db.ts) already implements
 * "reuse if live, else mint" as its top-level behavior (it looks up an
 * unconsumed, unexpired token for the same (kind, targetId) before ever
 * inserting), so calling it here with the same (kind: "walkin_session",
 * targetId: bookingId) the original walkin/start.ts mint used is sufficient
 * — no separate lookup needs to be hand-rolled. In practice this always
 * hits the reuse branch: walkin/start.ts mints the token with the same 2h
 * TTL as the hold itself (WALK_IN_HOLD_TTL_MS), and this reminder fires in
 * the hold's final 30 minutes — well before the token's own expiry. The
 * mint-fresh fallback only matters if the original token was somehow
 * already consumed (shouldn't happen while the booking is still
 * pending_payment) or expired early.
 *
 * No new DB index for the reminder query — see the "Index decision" note
 * in .superpowers/sdd/payment-task-4-report.md.
 */
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { mintToken } from "@/lib/check-in/tokens-db";
import { dispatchPaymentReminder } from "./messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";

const REMINDER_WINDOW_MS = 30 * 60_000;

export interface SendDuePaymentRemindersResult {
  reminded: number;
}

/**
 * Resolve the self-serve payment link for a due booking, minting/reusing
 * its walkin_session token. Returns null only if the booking's session or
 * booker user can no longer be found (shouldn't happen — both are
 * FK-referenced from drop_in_bookings — but resolved defensively so a
 * dangling row can't throw out of the reminder loop).
 */
async function selfServeUrlForBooking(
  bookingId: string,
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const [ctx] = await db
    .select({
      organizationId: dropInSessions.organizationId,
      venueId: dropInSessions.venueId,
      userEmail: users.email,
      userPhone: users.phone,
    })
    .from(dropInSessions)
    .innerJoin(users, eq(users.id, userId))
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);
  if (!ctx) return null;

  const tok = await mintToken({
    kind: "walkin_session",
    targetId: bookingId,
    organizationId: ctx.organizationId,
    venueId: ctx.venueId,
    // Only consulted on the (rare/unreachable in practice) fresh-mint path
    // — see the module doc header. "kiosk_search" keeps the token's
    // provenance tag consistent with the walk-in flow it belongs to.
    sentVia: "kiosk_search",
    recipientUserId: userId,
    recipientEmail: ctx.userEmail,
    recipientPhone: ctx.userPhone,
    createdByUserId: null,
    ttlHours: 2,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  return `${appUrl}/self-serve/${tok.token}`;
}

export async function sendDuePaymentReminders(
  now: Date = new Date(),
): Promise<SendDuePaymentRemindersResult> {
  const db = getDb();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

  // Stamp-first: this single UPDATE...RETURNING is the whole atomicity
  // story. Two concurrent cron ticks both racing this statement can only
  // ever claim disjoint row sets — Postgres serializes the UPDATE per row
  // (row-level lock), and whichever tick commits first makes the row fail
  // isNull(reminderSentAt) for the other tick's WHERE re-check. There is no
  // separate "check, then send, then stamp" window for a crash to land in
  // between — the stamp IS the claim.
  const dueRows = await db
    .update(dropInBookings)
    .set({ reminderSentAt: now, updatedAt: now })
    .where(
      and(
        eq(dropInBookings.status, "pending_payment"),
        isNull(dropInBookings.reminderSentAt),
        gt(dropInBookings.promotionExpiresAt, now),
        lte(dropInBookings.promotionExpiresAt, windowEnd),
      ),
    )
    .returning({
      id: dropInBookings.id,
      sessionId: dropInBookings.sessionId,
      userId: dropInBookings.userId,
      promotionExpiresAt: dropInBookings.promotionExpiresAt,
    });

  let reminded = 0;
  for (const row of dueRows) {
    // promotionExpiresAt can't actually be null here — the WHERE clause
    // requires it to satisfy gt/lte comparisons — but the column is
    // nullable at the schema level, so narrow defensively for TS.
    if (!row.promotionExpiresAt) continue;
    reminded += 1;
    const bookingId = row.id;
    const sessionId = row.sessionId;
    const userId = row.userId;
    const expiresAt = row.promotionExpiresAt;
    await awaitDispatch(
      "dropin payment-reminder",
      async () => {
        const url = await selfServeUrlForBooking(bookingId, sessionId, userId);
        if (!url) return { ok: false, reason: "self_serve_context_not_found" };
        return dispatchPaymentReminder(bookingId, url, expiresAt);
      },
      { bookingId },
    );
  }

  return { reminded };
}
