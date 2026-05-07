/**
 * Full-flow drop-in integration test.
 *
 * Walks through the canonical lifecycle end-to-end at the library level
 * (no HTTP), the same way the book-confirmed / cancel tests already do:
 *
 *   1. Capacity-2 session created.
 *   2. Two free-rate users book → both confirmed.
 *   3. A third user attempts → blocked by checkCapacity → joins waitlist.
 *   4. First confirmed booker cancels >24h before start (default cancel
 *      window) → processCancelRefund flips the booking to cancelled and
 *      promotes the waitlister into pending_claim.
 *   5. The promoted user POSTs the magic claim token → row flips to
 *      confirmed.
 *   6. Final tally: 2 confirmed, 0 waitlisted, 1 cancelled.
 *   7. Admin cancels the entire session → both remaining confirmed
 *      bookings flip to cancelled with reason `session_cancelled`.
 *
 * Stripe is not exercised — all paid paths are skipped via session-rate
 * overrides (sessionRateCents = 0). Notifications fire as
 * fire-and-forget microtasks; the test asserts on DB state, not on
 * outbound delivery.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { eq, and } from "drizzle-orm";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { findClaimByToken, promoteNextWaitlister } from "@/lib/dropin/promotion";
import { processCancelRefund } from "@/lib/dropin/refund";
import { createTestDropInSession } from "../../utils/dropin-helpers";

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
  // Bypass the orchestrator (which only takes confirmed/free rows) and
  // insert the waitlist row directly. This mirrors what the booking
  // orchestrator would do once the session is full.
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

describe("drop-in full flow", () => {
  it("books → fills → waitlists → cancel-refund promotes → claim → final state; admin session cancel cascades", async () => {
    // Session 7 days out so the default 24h cancel-window refund applies.
    const ctx = await createTestDropInSession({
      capacity: 2,
      sessionRateCents: 0,
      memberRateCents: 0,
      startsAt: new Date(Date.now() + 7 * 86400_000),
    });

    const u1 = await insertTestUser("flow-u1");
    const u2 = await insertTestUser("flow-u2");
    const u3 = await insertTestUser("flow-u3");

    // Step 1: two confirmed bookings via the free-path orchestrator.
    const b1 = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u1.id,
      source: "online_booking",
    });
    expect(b1.ok).toBe(true);

    const b2 = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u2.id,
      source: "online_booking",
    });
    expect(b2.ok).toBe(true);

    // Step 2: third user → orchestrator refuses with session_full.
    const b3Try = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u3.id,
      source: "online_booking",
    });
    expect(b3Try.ok).toBe(false);
    if (!b3Try.ok) expect(b3Try.error.code).toBe("session_full");

    // Step 3: u3 joins the waitlist directly (matches what the customer
    // endpoint does when capacity is full).
    const waitlistedRow = await insertWaitlistedRow(ctx.sessionId, u3.id);

    // Pre-cancel sanity check: counts.
    {
      const all = await getDb()
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.sessionId, ctx.sessionId));
      const counts = all.reduce<Record<string, number>>(
        (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
        {},
      );
      expect(counts.confirmed).toBe(2);
      expect(counts.waitlisted).toBe(1);
    }

    // Step 4: u1 cancels well outside the cancel window. processCancelRefund
    // flips u1's row to cancelled and runs promoteNextWaitlister, which
    // moves u3 to pending_claim with a token + expiry.
    if (!b1.ok) throw new Error("b1 should be ok");
    const cancel = await processCancelRefund(b1.bookingId, {});
    expect(cancel.ok).toBe(true);
    expect(cancel.insideWindow).toBe(false);
    // refunded === false here because amountPaidCents was 0 (free-path).
    expect(cancel.refunded).toBe(false);
    expect(cancel.promotedNextBookingId).toBe(waitlistedRow.id);

    // Step 5: GET the claim metadata then POST the claim through the
    // library helper used by the API endpoint. We bypass the HTTP layer
    // here — the endpoint contract is exercised in claim.test.ts.
    const [promoted] = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, waitlistedRow.id));
    expect(promoted.status).toBe("pending_claim");
    expect(promoted.promotionToken).toBeTruthy();
    expect(promoted.promotionExpiresAt).toBeTruthy();

    const found = await findClaimByToken(promoted.promotionToken!);
    expect(found).not.toBeNull();
    expect(found?.expired).toBe(false);
    expect(found?.id).toBe(waitlistedRow.id);

    // Flip pending_claim → confirmed (the API endpoint runs this in a tx
    // with re-locking; we apply the same end-state directly here since
    // the orchestrator path was already covered in claim.test.ts).
    await getDb()
      .update(dropInBookings)
      .set({
        status: "confirmed",
        promotionToken: null,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, waitlistedRow.id));

    // Step 6: final state check.
    const after = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    const finalCounts = after.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
      {},
    );
    expect(finalCounts.confirmed).toBe(2); // u2 + u3-now-confirmed
    expect(finalCounts.waitlisted ?? 0).toBe(0);
    expect(finalCounts.cancelled).toBe(1); // u1

    // Step 7: admin cancels the session — every still-active booking
    // (the two confirmed) is forced to cancelled with reason
    // `session_cancelled` via processCancelRefund(adminOverride: true,
    // reason: "session_cancelled").
    const stillActive = after.filter((r) => r.status === "confirmed");
    for (const b of stillActive) {
      await processCancelRefund(b.id, {
        adminOverride: true,
        reason: "session_cancelled",
      });
    }
    await getDb()
      .update(dropInSessions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(dropInSessions.id, ctx.sessionId));

    const final = await getDb()
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, ctx.sessionId));
    const tally = final.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
      {},
    );
    expect(tally.confirmed ?? 0).toBe(0);
    expect(tally.cancelled).toBe(3); // all three users now cancelled

    // Reasons: original cancel was user_request, admin-cancelled were
    // session_cancelled.
    const reasonCounts = final.reduce<Record<string, number>>(
      (acc, r) => ({
        ...acc,
        [r.cancellationReason ?? "null"]:
          (acc[r.cancellationReason ?? "null"] ?? 0) + 1,
      }),
      {},
    );
    expect(reasonCounts.session_cancelled).toBe(2);
    expect(reasonCounts.user_request).toBe(1);

    const [sessionRow] = await getDb()
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(sessionRow.status).toBe("cancelled");
  });

  it("waitlist promotion stamps a token when a confirmed booking cancels", async () => {
    // Smaller-shape regression to keep the promotion piece visible in
    // isolation when the larger flow above gets churned later.
    const ctx = await createTestDropInSession({
      capacity: 1,
      sessionRateCents: 0,
      memberRateCents: 0,
      startsAt: new Date(Date.now() + 7 * 86400_000),
    });

    const a = await insertTestUser("promo-a");
    const b = await insertTestUser("promo-b");

    const aBooking = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: a.id,
      source: "online_booking",
    });
    if (!aBooking.ok) throw new Error("aBooking should be ok");

    const bWait = await insertWaitlistedRow(ctx.sessionId, b.id);

    // Cancel a; b should be promoted.
    await processCancelRefund(aBooking.bookingId, {});
    const [promoted] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.id, bWait.id),
          eq(dropInBookings.status, "pending_claim"),
        ),
      );
    expect(promoted).toBeDefined();
    expect(promoted.promotionToken).toBeTruthy();

    // Calling promoteNextWaitlister with no further waitlisters is a no-op.
    const noop = await promoteNextWaitlister(ctx.sessionId);
    expect(noop.promoted).toBe(false);
  });
});
