/**
 * Money lifecycle for a recurring rental block: deposit paid, balance paid.
 *
 * The block row is the payment source of truth. Sessions carry their own
 * pro-rated `amount_due_cents` but stay `payment_status = 'unpaid'` with
 * `amount_paid_cents = 0` until the block is settled in full, at which point
 * every session flips to `paid` at once. Allocating the deposit to the
 * earliest sessions reads better in per-session revenue reports but makes
 * partial refunds and mid-block cancellations genuinely confusing; block-level
 * truth is the deliberate call.
 *
 * Both entry points are idempotent on webhook replay: they classify the block
 * under `SELECT … FOR UPDATE` and bail unless it is in exactly the status the
 * transition expects, so a duplicate delivery is a no-op rather than a second
 * confirmation email.
 *
 * Expiry, reminders and completion sweeps are deliberately NOT here yet — they
 * arrive with the block-aware expiry work, together with the
 * `expirePendingRentals` fix that stops the per-session sweep eating a block's
 * sessions one at a time.
 */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { stripe } from "@/lib/stripe/client";
import { logAlert } from "@/lib/logging/alerts";
import { assertNoRentalConflict } from "@/lib/rentals/conflicts";
import {
  assertNoBlockConflict,
  BlockConflictError,
  removeSourceBlock,
  type Tx,
} from "@/lib/scheduling/blocks";
import { resolveTopLevelResourceId, syncRentalBlock } from "@/lib/scheduling/sync";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { balanceDueAt as deriveBalanceDueAt } from "./pricing";
import { clearQuoteMarkers } from "./quote-markers";
import { dispatchBlockConfirmation, dispatchBlockRaceLost } from "./messages";

export interface LifecycleResult {
  ok: boolean;
  reason?: string;
}

/** Fallback matching the rate-card column default, for an org with no row yet. */
const DEFAULT_BALANCE_LEAD_DAYS = 30;

/** Thrown only to roll the confirm transaction back; never escapes this module. */
class RaceLost extends Error {
  constructor(readonly conflicts: Array<{ sessionId: string; reason: string }>) {
    super("block lost its slots");
    this.name = "RaceLost";
  }
}

type BlockRow = typeof fieldRentalBlocks.$inferSelect;

export interface SessionSlot {
  id: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
}

export interface SessionConflict {
  sessionId: string;
  reason: string;
}

/** Live (non-cancelled) sessions of a block, in start order. */
async function loadLiveSessions(blockId: string): Promise<SessionSlot[]> {
  return getDb()
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
    })
    .from(fieldRentals)
    .where(and(eq(fieldRentals.blockId, blockId), ne(fieldRentals.status, "cancelled")))
    .orderBy(asc(fieldRentals.startsAt));
}

/**
 * Deterministic lock order, matching the create path: venue, then field
 * number, then start. Two writers touching overlapping blocks take the same
 * advisory locks in the same sequence and cannot deadlock.
 */
function inLockOrder(sessions: SessionSlot[]): SessionSlot[] {
  return [...sessions].sort((a, b) => {
    if (a.venueId !== b.venueId) return a.venueId < b.venueId ? -1 : 1;
    if (a.fieldNumber !== b.fieldNumber) return a.fieldNumber - b.fieldNumber;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

/**
 * Resolve each session's top-level ledger resource. Goes through the pool, so
 * it MUST run before any transaction opens — the pool is pinned to a single
 * connection and a pool query issued mid-transaction deadlocks.
 */
async function resolveSessionResources(
  sessions: SessionSlot[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const s of sessions) {
    const key = `${s.venueId}|${s.fieldNumber}`;
    if (!out.has(key)) {
      out.set(key, await resolveTopLevelResourceId(s.venueId, s.fieldNumber));
    }
  }
  return out;
}

/**
 * Has anything taken these slots out from under the block? Runs both checks
 * the create path runs — `assertNoRentalConflict` (the same one the public
 * booking path uses) and `assertNoBlockConflict` (the ledger check, which
 * respects the field-resource hierarchy and internal reserves) — each
 * excluding the session's own row so a session never conflicts with itself.
 *
 * Must be called inside a transaction: both checks take transaction-scoped
 * advisory locks and are only meaningful for that transaction's lifetime.
 */
async function checkSessionConflicts(
  tx: Tx,
  sessions: SessionSlot[],
  resourceIds: Map<string, string | null>,
): Promise<SessionConflict[]> {
  const conflicts: SessionConflict[] = [];
  for (const s of inLockOrder(sessions)) {
    const rentalConflict = await assertNoRentalConflict(tx, {
      venueId: s.venueId,
      fieldNumber: s.fieldNumber,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      excludeRentalId: s.id,
    });
    if (rentalConflict) {
      conflicts.push({ sessionId: s.id, reason: rentalConflict });
      continue;
    }
    const resourceId = resourceIds.get(`${s.venueId}|${s.fieldNumber}`) ?? null;
    if (!resourceId) continue; // Not inventory-tracked; the ledger has nothing to say.
    try {
      await assertNoBlockConflict(
        tx,
        { resourceId, startsAt: s.startsAt, endsAt: s.endsAt },
        { sourceType: "rental", sourceId: s.id },
      );
    } catch (err) {
      if (err instanceof BlockConflictError) {
        conflicts.push({ sessionId: s.id, reason: err.message });
        continue;
      }
      throw err;
    }
  }
  return conflicts;
}

/**
 * Read-only race check for the payment endpoint: a block that has already lost
 * its slots must never reach a card form. The same check runs again inside the
 * webhook transaction, which is the backstop for a slot lost during checkout.
 */
export async function findBlockRaceConflicts(
  blockId: string,
): Promise<SessionConflict[]> {
  const sessions = await loadLiveSessions(blockId);
  if (sessions.length === 0) return [];
  const resourceIds = await resolveSessionResources(sessions);
  return getDb().transaction((tx) => checkSessionConflicts(tx, sessions, resourceIds));
}

async function loadBalanceLeadDays(organizationId: string): Promise<number> {
  const [row] = await getDb()
    .select({ days: fieldRentalRateCard.balanceDueLeadDays })
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, organizationId))
    .limit(1);
  return row?.days ?? DEFAULT_BALANCE_LEAD_DAYS;
}

/** Best-effort refund; returns the refund id, or null with the failure reason. */
async function refundBlockPayment(
  paymentIntentId: string | null,
): Promise<{ refundId: string | null; error: string | null }> {
  if (!paymentIntentId) return { refundId: null, error: "no-payment-intent" };
  if (!stripe) return { refundId: null, error: "stripe-not-configured" };
  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { refundId: refund.id, error: null };
  } catch (err) {
    return { refundId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The money landed on a block we cannot honour — either it lost its slots
 * between the link going out and the payment settling, or it had already been
 * cancelled. Refund immediately, cancel the block and every session, free the
 * ledger, and tell both the admin and the renter. Confirming a booking on top
 * of someone else's is never the right outcome.
 */
async function refundAndCancel(
  block: BlockRow,
  leg: "deposit" | "balance",
  paymentIntentId: string | null,
  paidCents: number,
  cause: "race_lost" | "already_cancelled",
  detail: string,
): Promise<LifecycleResult> {
  const { refundId, error } = await refundBlockPayment(paymentIntentId);
  const db = getDb();
  const now = new Date();

  const cancelled = await db.transaction(async (tx) => {
    const rows = await tx
      .update(fieldRentals)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: "venue_unavailable",
        paymentExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(fieldRentals.blockId, block.id), ne(fieldRentals.status, "cancelled")),
      )
      .returning({ id: fieldRentals.id });

    await tx
      .update(fieldRentalBlocks)
      .set({
        status: "cancelled",
        cancelledAt: block.cancelledAt ?? now,
        // Record the intent either way: without it, a failed refund leaves
        // staff no id to refund by hand.
        ...(leg === "deposit"
          ? { stripeDepositPiId: block.stripeDepositPiId ?? paymentIntentId }
          : { stripeBalancePiId: block.stripeBalancePiId ?? paymentIntentId }),
        updatedAt: now,
      })
      .where(eq(fieldRentalBlocks.id, block.id));

    return rows;
  });

  // Ledger writes open their own transaction, so they run after the commit.
  for (const row of cancelled) await removeSourceBlock("rental", row.id);
  await clearQuoteMarkers(block.id);

  await logAlert(
    refundId ? "rental_block_payment_refunded" : "rental_block_refund_failed",
    {
      blockId: block.id,
      cause,
      detail,
      stripePaymentIntentId: paymentIntentId,
      paidCents,
      refundId,
      error,
    },
  );

  await awaitDispatch(
    "rental block payment-refunded notice",
    () => dispatchBlockRaceLost(block.id, Boolean(refundId)),
    { blockId: block.id },
  );

  return {
    ok: false,
    reason: `block ${block.id} ${cause}; ${refundId ? `refunded ${refundId}` : `refund FAILED (${error ?? "unknown"})`}`,
  };
}

/**
 * Deposit settled: the block goes `active`, every session flips
 * `pending_payment` → `confirmed`, the ledger holds are upgraded from expiring
 * to firm, the balance due date is derived, and the quote markers this block
 * carried as a draft are cleared.
 */
export async function applyDepositPaid(
  blockId: string,
  paymentIntentId: string | null,
  paidCents: number,
): Promise<LifecycleResult> {
  const db = getDb();

  // Pass one: classify under a row lock. No external calls (a Stripe refund
  // takes seconds and must never be made while holding the lock).
  const classified = await db.transaction(async (tx) => {
    const [block] = await tx
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.id, blockId))
      .for("update");
    if (!block) return { kind: "skip" as const, reason: `block ${blockId} not found` };
    if (block.status === "cancelled") return { kind: "refund" as const, block };
    if (block.depositPaidAt !== null) {
      // Webhook replay, or the admin marked it paid offline in the meantime.
      return { kind: "skip" as const, reason: `block ${blockId} deposit already recorded` };
    }
    if (block.status !== "awaiting_deposit") {
      return {
        kind: "skip" as const,
        reason: `block ${blockId} in unexpected status ${block.status}`,
      };
    }
    return { kind: "confirm" as const, block };
  });

  if (classified.kind === "skip") return { ok: false, reason: classified.reason };
  if (classified.kind === "refund") {
    return refundAndCancel(
      classified.block,
      "deposit",
      paymentIntentId,
      paidCents,
      "already_cancelled",
      "deposit settled after the block was cancelled",
    );
  }

  const block = classified.block;

  // Pool reads BEFORE the write transaction: the pool is pinned to a single
  // connection, so a pool query issued mid-transaction deadlocks.
  const sessions = await loadLiveSessions(blockId);
  if (sessions.length === 0) {
    return { ok: false, reason: `block ${blockId} has no live sessions` };
  }

  const leadDays = await loadBalanceLeadDays(block.organizationId);
  const resourceIds = await resolveSessionResources(sessions);

  const now = new Date();
  const balanceDueAt = deriveBalanceDueAt(sessions[0].startsAt, leadDays);

  try {
    await db.transaction(async (tx) => {
      const [reLocked] = await tx
        .select()
        .from(fieldRentalBlocks)
        .where(eq(fieldRentalBlocks.id, blockId))
        .for("update");
      if (!reLocked || reLocked.status !== "awaiting_deposit" || reLocked.depositPaidAt) {
        throw new RaceLost([]);
      }

      // Re-check every session inside the write transaction. The same slot may
      // have been sold between the Checkout Session being minted and the money
      // landing, and confirming a booking on top of someone else's is never
      // the right outcome.
      const conflicts = await checkSessionConflicts(tx, sessions, resourceIds);
      if (conflicts.length > 0) throw new RaceLost(conflicts);

      await tx
        .update(fieldRentalBlocks)
        .set({
          status: "active",
          depositPaidAt: now,
          stripeDepositPiId: paymentIntentId,
          depositExpiresAt: null,
          balanceDueAt,
          updatedAt: now,
        })
        .where(eq(fieldRentalBlocks.id, blockId));

      // Sessions become confirmed but stay UNPAID: the block row is the
      // payment truth until the balance settles.
      await tx
        .update(fieldRentals)
        .set({
          status: "confirmed",
          paymentExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(eq(fieldRentals.blockId, blockId), ne(fieldRentals.status, "cancelled")),
        );
    });
  } catch (err) {
    if (err instanceof RaceLost) {
      if (err.conflicts.length === 0) {
        // The block moved under us between the two passes — not a lost race,
        // so no refund: whoever moved it owns the money decision.
        return { ok: false, reason: `block ${blockId} status changed during processing` };
      }
      return refundAndCancel(
        block,
        "deposit",
        paymentIntentId,
        paidCents,
        "race_lost",
        err.conflicts.map((c) => `${c.sessionId}: ${c.reason}`).join("; "),
      );
    }
    throw err;
  }

  // Upgrade the ledger holds from expiring to firm. upsertSourceBlock opens
  // its own transaction, so this runs after the commit. Never fail the webhook
  // over a ledger hiccup: the money already moved.
  for (const s of sessions) {
    try {
      await syncRentalBlock(s.id);
    } catch (err) {
      console.error("[rentals] block ledger sync after deposit failed", s.id, err);
    }
  }

  // A confirmed block supersedes its own soft hold.
  await clearQuoteMarkers(blockId);

  await awaitDispatch(
    "rental block deposit confirmation",
    () => dispatchBlockConfirmation(blockId),
    { blockId },
  );

  return { ok: true };
}

/**
 * Balance settled: the block is paid in full, so every live session flips to
 * `payment_status = 'paid'` with its allocated amount recorded. Session
 * statuses are already `confirmed` from the deposit, so nothing about the
 * schedule or the ledger changes here.
 */
export async function applyBalancePaid(
  blockId: string,
  paymentIntentId: string | null,
  paidCents: number,
): Promise<LifecycleResult> {
  const db = getDb();

  const classified = await db.transaction(async (tx) => {
    const [block] = await tx
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.id, blockId))
      .for("update");
    if (!block) return { kind: "skip" as const, reason: `block ${blockId} not found` };
    if (block.status === "cancelled") return { kind: "refund" as const, block };
    if (block.balancePaidAt !== null) {
      return { kind: "skip" as const, reason: `block ${blockId} balance already recorded` };
    }
    if (block.status !== "active") {
      return {
        kind: "skip" as const,
        reason: `block ${blockId} in unexpected status ${block.status}`,
      };
    }

    const now = new Date();
    await tx
      .update(fieldRentalBlocks)
      .set({
        balancePaidAt: now,
        stripeBalancePiId: paymentIntentId,
        updatedAt: now,
      })
      .where(eq(fieldRentalBlocks.id, blockId));

    // Fully settled — the sessions can finally carry their allocated amounts.
    await tx
      .update(fieldRentals)
      .set({
        paymentStatus: "paid",
        amountPaidCents: sql`${fieldRentals.amountDueCents}`,
        updatedAt: now,
      })
      .where(
        and(eq(fieldRentals.blockId, blockId), ne(fieldRentals.status, "cancelled")),
      );

    return { kind: "paid" as const };
  });

  if (classified.kind === "skip") return { ok: false, reason: classified.reason };
  if (classified.kind === "refund") {
    return refundAndCancel(
      classified.block,
      "balance",
      paymentIntentId,
      paidCents,
      "already_cancelled",
      "balance settled after the block was cancelled",
    );
  }
  return { ok: true };
}
