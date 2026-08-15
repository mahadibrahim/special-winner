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
 * The three cron sweeps live at the bottom of this file: an unpaid block is
 * expired as a UNIT (never session by session - `expirePendingRentals` skips
 * block rows for exactly that reason), a deposit-paid block is reminded about
 * its balance and never auto-cancelled, and a fully-paid block whose last
 * session has ended is marked complete.
 */
import {
  and,
  asc,
  eq,
  exists,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
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
import {
  dispatchBlockConfirmation,
  dispatchBlockExpiredAdminNotice,
  dispatchBlockQuote,
  dispatchBlockRaceLost,
} from "./messages";

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
 * it MUST run before any transaction opens - the pool is pinned to a single
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
 * the create path runs - `assertNoRentalConflict` (the same one the public
 * booking path uses) and `assertNoBlockConflict` (the ledger check, which
 * respects the field-resource hierarchy and internal reserves) - each
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

/**
 * Best-effort refund of one payment intent; returns the refund id, or null with
 * the failure reason. Omit `amountCents` to refund the intent in full (the
 * lost-race path); pass it for the admin's partial block refund, where the
 * caller has already split the ask across the deposit and balance intents.
 */
export async function refundBlockPayment(
  paymentIntentId: string | null,
  amountCents?: number,
  idempotencyKey?: string,
): Promise<{ refundId: string | null; error: string | null }> {
  if (!paymentIntentId) return { refundId: null, error: "no-payment-intent" };
  if (!stripe) return { refundId: null, error: "stripe-not-configured" };
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountCents === undefined ? {} : { amount: amountCents }),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { refundId: refund.id, error: null };
  } catch (err) {
    return { refundId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * What the renter has actually paid and not had back - the refund ceiling.
 * The block row is the payment truth, so this is the deposit and balance
 * figures gated on their paid-at timestamps; a refund writes the reduced
 * figure back, which is what keeps repeat refunds capped.
 */
export function blockPaidCents(block: BlockRow): number {
  return (
    (block.depositPaidAt ? block.depositDueCents : 0) +
    (block.balancePaidAt ? block.balanceDueCents : 0)
  );
}

/**
 * The money landed on a block we cannot honour - either it lost its slots
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

      // A deposit that covers the whole price leaves nothing to collect, so
      // this payment settles the block outright. Read off the re-locked row:
      // sessions cancelled since the link went out may have taken the balance
      // to zero (see applyCancellationToBlockMoney).
      const fullySettled = reLocked.balanceDueCents === 0;

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
          // A 100% deposit (or a block discounted to the deposit figure) leaves
          // nothing to collect, and there is no second payment coming to stamp
          // this. Without it the sessions never flip to paid,
          // completeFinishedBlocks never fires, and the list flags a
          // fully-settled block as overdue forever.
          ...(fullySettled ? { balancePaidAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(fieldRentalBlocks.id, blockId));

      // Sessions become confirmed. They stay UNPAID while a balance is
      // outstanding (the block row is the payment truth until it settles); a
      // block settled in full by its deposit carries its allocated amounts now.
      await tx
        .update(fieldRentals)
        .set({
          status: "confirmed",
          paymentExpiresAt: null,
          ...(fullySettled
            ? {
                paymentStatus: "paid" as const,
                amountPaidCents: sql`${fieldRentals.amountDueCents}`,
              }
            : {}),
          updatedAt: now,
        })
        .where(
          and(eq(fieldRentals.blockId, blockId), ne(fieldRentals.status, "cancelled")),
        );
    });
  } catch (err) {
    if (err instanceof RaceLost) {
      if (err.conflicts.length === 0) {
        // The block moved under us between the two passes - not a lost race,
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

    // Fully settled - the sessions can finally carry their allocated amounts.
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

/* ------------------------------------------------------------------ *
 * Cron sweeps
 * ------------------------------------------------------------------ */

/**
 * Cancel every `awaiting_deposit` block whose hold has lapsed, TOGETHER with
 * all of its sessions, and free the ledger.
 *
 * This is the block-level counterpart to `expirePendingRentals`, which now
 * skips `block_id IS NOT NULL` rows: a block's sessions all carry the same
 * `payment_expires_at`, so the per-session sweep would have cancelled them one
 * at a time while the deposit link stayed live, leaving the renter looking at a
 * payment page for a schedule that no longer existed.
 *
 * The block is re-read `FOR UPDATE` inside the transaction so a deposit landing
 * mid-sweep wins: whoever gets the lock first decides, and the webhook's own
 * status guard makes the loser a no-op.
 */
export async function expireUnpaidRentalBlocks(): Promise<{ expired: number }> {
  const db = getDb();
  const now = new Date();

  const due = await db
    .select({ id: fieldRentalBlocks.id })
    .from(fieldRentalBlocks)
    .where(
      and(
        eq(fieldRentalBlocks.status, "awaiting_deposit"),
        isNull(fieldRentalBlocks.depositPaidAt),
        isNotNull(fieldRentalBlocks.depositExpiresAt),
        lt(fieldRentalBlocks.depositExpiresAt, now),
      ),
    )
    .orderBy(asc(fieldRentalBlocks.createdAt));

  let expired = 0;
  for (const { id } of due) {
    const cancelled = await db.transaction(async (tx) => {
      const [block] = await tx
        .select()
        .from(fieldRentalBlocks)
        .where(eq(fieldRentalBlocks.id, id))
        .for("update");
      // Deposit landed (or an admin moved the block) between the scan and the
      // lock - leave it alone.
      if (!block || block.status !== "awaiting_deposit" || block.depositPaidAt) {
        return null;
      }

      const rows = await tx
        .update(fieldRentals)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: "user_request",
          paymentExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(fieldRentals.blockId, id), ne(fieldRentals.status, "cancelled")))
        .returning({ id: fieldRentals.id });

      await tx
        .update(fieldRentalBlocks)
        .set({
          status: "cancelled",
          cancelledAt: now,
          depositExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(fieldRentalBlocks.id, id));

      return rows;
    });

    if (!cancelled) continue;
    expired += 1;

    // Ledger writes open their own transaction, so they run after the commit.
    for (const row of cancelled) await removeSourceBlock("rental", row.id);
    await clearQuoteMarkers(id);

    await awaitDispatch(
      "rental block deposit-hold expired notice",
      () => dispatchBlockExpiredAdminNotice(id),
      { blockId: id },
    );
  }

  return { expired };
}

/** Reminder ladder, earliest first. A block only ever moves forward through it. */
const REMINDER_STAGES = ["t14", "t3", "overdue"] as const;
export type BlockReminderStage = (typeof REMINDER_STAGES)[number];

const DAY_MS = 86_400_000;

/**
 * Which reminder a block is owed right now: T-14, T-3, then a single overdue
 * nudge at T+1. Returns null before the ladder opens.
 */
export function balanceReminderStage(
  balanceDueAt: Date,
  now: Date,
): BlockReminderStage | null {
  const daysUntilDue = (balanceDueAt.getTime() - now.getTime()) / DAY_MS;
  if (daysUntilDue <= -1) return "overdue";
  if (daysUntilDue <= 3) return "t3";
  if (daysUntilDue <= 14) return "t14";
  return null;
}

const stageRank = (stage: string | null): number =>
  stage === null ? -1 : REMINDER_STAGES.indexOf(stage as BlockReminderStage);

/**
 * Ask for the balance at T-14 and T-3, then once more at T+1 when it is
 * overdue. Sends through `dispatchBlockQuote(id, "balance")`, which mints the
 * same idempotent token the admin's "Send balance link now" button uses, so a
 * renter never juggles two URLs.
 *
 * It NEVER cancels. Auto-cancelling a winter block whose deposit is already
 * paid is never the right default; an unpaid balance is a phone call, and the
 * admin list flags it as overdue on the same derived condition.
 */
export async function sendBlockBalanceReminders(): Promise<{ sent: number }> {
  const db = getDb();
  const now = new Date();

  const candidates = await db
    .select({
      id: fieldRentalBlocks.id,
      balanceDueAt: fieldRentalBlocks.balanceDueAt,
      reminderStage: fieldRentalBlocks.reminderStage,
    })
    .from(fieldRentalBlocks)
    .where(
      and(
        eq(fieldRentalBlocks.status, "active"),
        isNull(fieldRentalBlocks.balancePaidAt),
        gt(fieldRentalBlocks.balanceDueCents, 0),
        isNotNull(fieldRentalBlocks.balanceDueAt),
        lt(fieldRentalBlocks.balanceDueAt, new Date(now.getTime() + 14 * DAY_MS)),
      ),
    )
    .orderBy(asc(fieldRentalBlocks.balanceDueAt));

  let sent = 0;
  for (const row of candidates) {
    if (!row.balanceDueAt) continue;
    const stage = balanceReminderStage(row.balanceDueAt, now);
    if (!stage) continue;
    // Only ever forward: a block that already had its T-3 nudge does not get
    // another one, and a re-run of the sweep is a no-op.
    if (stageRank(stage) <= stageRank(row.reminderStage)) continue;

    // Stamp first, send second. A send that throws must not queue the renter
    // up for the same reminder on the next tick.
    await db
      .update(fieldRentalBlocks)
      .set({ reminderStage: stage, lastReminderAt: now, updatedAt: now })
      .where(eq(fieldRentalBlocks.id, row.id));

    await awaitDispatch(
      `rental block balance reminder (${stage})`,
      () => dispatchBlockQuote(row.id, "balance"),
      { blockId: row.id, stage },
    );
    sent += 1;
  }

  return { sent };
}

/**
 * A block is done when its balance is settled and its last live session has
 * ended. Purely a bookkeeping move so finished winter blocks fall out of the
 * active list; nothing about the money or the ledger changes.
 */
export async function completeFinishedBlocks(): Promise<{ completed: number }> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .update(fieldRentalBlocks)
    .set({ status: "completed", updatedAt: now })
    .where(
      and(
        eq(fieldRentalBlocks.status, "active"),
        isNotNull(fieldRentalBlocks.balancePaidAt),
        // At least one session has actually been played...
        exists(
          db
            .select({ one: sql`1` })
            .from(fieldRentals)
            .where(
              and(
                eq(fieldRentals.blockId, fieldRentalBlocks.id),
                ne(fieldRentals.status, "cancelled"),
                lte(fieldRentals.endsAt, now),
              ),
            ),
        ),
        // ...and none is still ahead of us.
        notExists(
          db
            .select({ one: sql`1` })
            .from(fieldRentals)
            .where(
              and(
                eq(fieldRentals.blockId, fieldRentalBlocks.id),
                ne(fieldRentals.status, "cancelled"),
                gt(fieldRentals.endsAt, now),
              ),
            ),
        ),
      ),
    )
    .returning({ id: fieldRentalBlocks.id });

  return { completed: rows.length };
}
