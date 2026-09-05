import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { staffNotificationLog } from "@/lib/db/schema/staff-notifications";

/**
 * Staff notification throttling.
 *
 * When a conversation is routed to a staff member (coach or admin), we
 * want to notify them — but NOT 20 times in 5 minutes when a parent
 * fires off a burst of messages. This module makes that call:
 *
 *   shouldNotifyStaff(userId) — returns whether to actually send an
 *     out-of-band notification now, based on when we last notified.
 *     Caller is responsible for recording the notification after send.
 *
 *   recordStaffNotification(...) — writes the log row. Called AFTER the
 *     out-of-band send completes (successful or not — the log captures
 *     intent, not delivery).
 *
 * The throttle window defaults to 5 minutes. Within that window, only
 * the first routed message generates an out-of-band notification; all
 * subsequent ones still land in the staff inbox (the UI shows them
 * immediately on next poll) but don't fire another alert.
 *
 * This design is deliberately serverless-friendly: the state lives in
 * the database, so it survives Netlify Function cold starts and works
 * across multiple concurrent invocations.
 */

const DEFAULT_THROTTLE_WINDOW_SECONDS = 5 * 60;

export type StaffNotificationType =
  | "new_inbound_message"
  | "conversation_assigned"
  | "payment_question"
  | "urgent_escalation";

export interface NotificationDecision {
  shouldNotify: boolean;
  reason: "no_recent" | "throttled" | "urgent_override";
  lastNotifiedAt?: Date;
}

/**
 * Check whether we should fire an out-of-band notification to this staff
 * member right now, or suppress it as throttled.
 *
 * Urgent notifications bypass throttling — if a message was classified
 * as urgent_escalation (e.g., medical emergency), we ping even inside
 * the throttle window.
 */
export async function shouldNotifyStaff(
  staffUserId: string,
  notificationType: StaffNotificationType,
  windowSeconds: number = DEFAULT_THROTTLE_WINDOW_SECONDS,
): Promise<NotificationDecision> {
  if (notificationType === "urgent_escalation") {
    return { shouldNotify: true, reason: "urgent_override" };
  }

  const cutoff = new Date(Date.now() - windowSeconds * 1000);
  const db = getDb();

  const recent = await db
    .select({
      id: staffNotificationLog.id,
      sentAt: staffNotificationLog.sentAt,
    })
    .from(staffNotificationLog)
    .where(
      and(
        eq(staffNotificationLog.staffUserId, staffUserId),
        gte(staffNotificationLog.sentAt, cutoff),
      ),
    )
    .orderBy(staffNotificationLog.sentAt)
    .limit(1);

  if (recent.length > 0) {
    return {
      shouldNotify: false,
      reason: "throttled",
      lastNotifiedAt: recent[0].sentAt,
    };
  }

  return { shouldNotify: true, reason: "no_recent" };
}

/**
 * Record that we notified a staff member. Call after attempting the
 * out-of-band send, whether it succeeded or not — this tracks intent
 * for throttling purposes.
 */
export async function recordStaffNotification(params: {
  staffUserId: string;
  conversationId: string;
  notificationType: StaffNotificationType;
  deliveredChannel?: "sms" | "email" | "telegram" | "in_app";
}): Promise<void> {
  const db = getDb();
  await db.insert(staffNotificationLog).values({
    staffUserId: params.staffUserId,
    conversationId: params.conversationId,
    notificationType: params.notificationType,
    deliveredChannel: params.deliveredChannel ?? "in_app",
  });
}

/**
 * Purge old notification log entries. Not security-critical — throttling
 * queries only look back 5 minutes anyway. Keep a week's worth for audit,
 * drop everything older. Intended to be called from a cron.
 */
export async function purgeOldStaffNotifications(
  olderThanDays = 7,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const db = getDb();
  const { sql } = await import("drizzle-orm");
  await db
    .delete(staffNotificationLog)
    // Raw sql`` params bypass drizzle's column type mapping — the postgres.js
    // driver can't bind a bare Date here, so send an ISO string instead (same
    // fix as materialize.ts's expires_at comparison).
    .where(sql`${staffNotificationLog.sentAt} < ${cutoff.toISOString()}`);
}
