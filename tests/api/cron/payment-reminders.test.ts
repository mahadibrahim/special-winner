/**
 * POST /api/cron/expire-pending-claims — payment-reminder pass.
 *
 * `sendDuePaymentReminders` (src/lib/dropin/payment-reminder.ts) runs first
 * in this cron route, before `expireOverduePromotions`. It stamps
 * `reminderSentAt` on `pending_payment` walk-in holds whose
 * `promotionExpiresAt` falls within the next 30 minutes, then dispatches
 * one message per stamped row.
 *
 * These tests seed rows directly via drizzle (mirroring
 * expire-payment-holds.test.ts) and assert on DB end-state
 * (`reminderSentAt`) rather than on an actual SMS/email being delivered.
 * Neither RESEND_API_KEY nor a real SMS provider is configured against
 * this local/CI DB, so `dispatchPaymentReminder`'s underlying sends
 * fail soft (isEmailConfigured()/isSmsConfigured() return false,
 * `dispatch()` resolves `{ ok: false, reason: "no_channel_available" }`
 * or similar) — `awaitDispatch` logs that and does not throw, and never
 * touches `reminderSentAt` (it's stamped before the send is even
 * attempted). This is the same "fails soft, stamp is the contract"
 * pattern the pre-existing waitlist-promotion regression test in
 * expire-payment-holds.test.ts already relies on implicitly.
 */
import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { createTestDropInSession } from "../../utils/dropin-helpers";
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

async function insertPendingPaymentHold(
  sessionId: string,
  userId: string,
  promotionExpiresAt: Date,
) {
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "pending_payment",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 0,
      promotionExpiresAt,
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

describe("Cron: payment-hold reminders (expire-pending-claims reminder pass)", () => {
  it("stamps reminderSentAt for a hold expiring within 30 minutes", async () => {
    const ctx = await createTestDropInSession({ capacity: 4 });
    const holder = await insertTestUser("reminder-due-soon");
    const hold = await insertPendingPaymentHold(
      ctx.sessionId,
      holder.id,
      new Date(Date.now() + 20 * 60_000),
    );

    const json = await runCron();
    expect(json.reminded).toBeGreaterThanOrEqual(1);

    const after = await getBookingById(hold.id);
    expect(after.status).toBe("pending_payment");
    expect(after.reminderSentAt).not.toBeNull();
  });

  it("does not remind a hold whose expiry is 2 hours out", async () => {
    const ctx = await createTestDropInSession({ capacity: 4 });
    const holder = await insertTestUser("reminder-not-due");
    const hold = await insertPendingPaymentHold(
      ctx.sessionId,
      holder.id,
      new Date(Date.now() + WALK_IN_HOLD_TTL_MS),
    );

    await runCron();

    const after = await getBookingById(hold.id);
    expect(after.status).toBe("pending_payment");
    expect(after.reminderSentAt).toBeNull();
  });

  it("is exactly-once across two consecutive cron calls (already-reminded row is not re-stamped or re-counted)", async () => {
    const ctx = await createTestDropInSession({ capacity: 4 });
    const holder = await insertTestUser("reminder-exactly-once");
    const hold = await insertPendingPaymentHold(
      ctx.sessionId,
      holder.id,
      new Date(Date.now() + 15 * 60_000),
    );

    await runCron();
    const afterFirst = await getBookingById(hold.id);
    expect(afterFirst.reminderSentAt).not.toBeNull();
    const stampedAt = afterFirst.reminderSentAt!.getTime();

    const second = await runCron();
    const afterSecond = await getBookingById(hold.id);
    // Same timestamp — the second cron tick's UPDATE...WHERE
    // reminderSentAt IS NULL never touches this row again.
    expect(afterSecond.reminderSentAt).not.toBeNull();
    expect(afterSecond.reminderSentAt!.getTime()).toBe(stampedAt);
    expect(typeof second.reminded).toBe("number");
  });

  it("does not remind a hold that already has reminderSentAt set, even if within the window", async () => {
    const ctx = await createTestDropInSession({ capacity: 4 });
    const holder = await insertTestUser("reminder-already-sent");
    const hold = await insertPendingPaymentHold(
      ctx.sessionId,
      holder.id,
      new Date(Date.now() + 10 * 60_000),
    );
    const priorStamp = new Date(Date.now() - 5 * 60_000);
    await getDb()
      .update(dropInBookings)
      .set({ reminderSentAt: priorStamp })
      .where(eq(dropInBookings.id, hold.id));

    await runCron();

    const after = await getBookingById(hold.id);
    expect(after.reminderSentAt).not.toBeNull();
    expect(after.reminderSentAt!.getTime()).toBe(priorStamp.getTime());
  });

  it("GET describes the reminder pass without sending", async () => {
    const res = await apiFetch(CRON_ENDPOINT, { method: "GET" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description.toLowerCase()).toContain("payment");
  });
});
