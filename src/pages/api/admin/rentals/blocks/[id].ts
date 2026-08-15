/**
 * GET   /api/admin/rentals/blocks/:id → the block plus its sessions.
 * PATCH /api/admin/rentals/blocks/:id → edit metadata, cancel the remaining
 *        sessions from a date forward, or cancel the whole block.
 *
 * Body is one of:
 *   { label?, notes? }                 — metadata edit
 *   { cancelRemainingFrom: ISO8601 }   — cancel sessions at/after that instant
 *   { cancel: true }                   — cancel the block and every session
 *
 * `cancelRemainingFrom` also takes the cancelled sessions' money off the block:
 * the unpaid balance drops by their allocated dollars (see
 * `applyCancellationToBlockMoney`), because the balance link, the reminder
 * ladder and the pay endpoint all read those figures live and would otherwise
 * keep charging for dates that no longer exist.
 *
 * Money already COLLECTED is a different question, and cancellation only
 * SUGGESTS a figure for it: issuing it against the deposit and balance payment
 * intents is POST /api/admin/rentals/blocks/:id/refund's job, and it caps the
 * amount on the same `blockPaidCents` figure used here.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { removeSourceBlock } from "@/lib/scheduling/blocks";
import { clearQuoteMarkers } from "@/lib/rentals/blocks/quote-markers";
import { blockPaidCents } from "@/lib/rentals/blocks/lifecycle";
import { applyCancellationToBlockMoney } from "@/lib/rentals/blocks/pricing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Whole dollars, per the block money invariant. */
const toWholeDollars = (cents: number) => Math.round(cents / 100) * 100;

async function loadBlock(blockId: string, orgId: string) {
  const [block] = await getDb()
    .select()
    .from(fieldRentalBlocks)
    .where(eq(fieldRentalBlocks.id, blockId))
    .limit(1);
  if (!block || block.organizationId !== orgId) return null;
  return block;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const blockId = context.params.id;
  if (!blockId) return json({ error: "block id required" }, 400);

  const block = await loadBlock(blockId, auth.organizationId);
  if (!block) return ownershipDeniedResponse();

  const sessions = await getDb()
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      venueName: venues.name,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentStatus: fieldRentals.paymentStatus,
      amountDueCents: fieldRentals.amountDueCents,
      amountPaidCents: fieldRentals.amountPaidCents,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
    })
    .from(fieldRentals)
    .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.blockId, blockId))
    .orderBy(asc(fieldRentals.startsAt));

  return json({ block, sessions }, 200);
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const blockId = context.params.id;
  if (!blockId) return json({ error: "block id required" }, 400);

  let body: {
    label?: string;
    notes?: string;
    cancel?: boolean;
    cancelRemainingFrom?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const block = await loadBlock(blockId, auth.organizationId);
  if (!block) return ownershipDeniedResponse();

  const db = getDb();
  const now = new Date();

  // --- cancel the whole block ---
  if (body.cancel === true) {
    const cancelled = await db.transaction(async (tx) => {
      const rows = await tx
        .update(fieldRentals)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: "admin_override",
          paymentExpiresAt: null,
          updatedAt: now,
        })
        .where(and(eq(fieldRentals.blockId, blockId), ne(fieldRentals.status, "cancelled")))
        .returning({ id: fieldRentals.id, amountDueCents: fieldRentals.amountDueCents });

      await tx
        .update(fieldRentalBlocks)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(fieldRentalBlocks.id, blockId));

      return rows;
    });

    // Ledger writes open their own transaction, so they run after the commit.
    for (const row of cancelled) await removeSourceBlock("rental", row.id);
    await clearQuoteMarkers(blockId);

    const suggestedRefundCents = Math.min(
      toWholeDollars(cancelled.reduce((a, r) => a + r.amountDueCents, 0)),
      blockPaidCents(block),
    );
    const [updated] = await db
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.id, blockId))
      .limit(1);
    return json(
      {
        block: updated,
        cancelledSessionIds: cancelled.map((r) => r.id),
        suggestedRefundCents,
      },
      200,
    );
  }

  // --- cancel the remaining sessions from a date forward ---
  if (body.cancelRemainingFrom !== undefined) {
    const from = new Date(body.cancelRemainingFrom);
    if (Number.isNaN(from.getTime())) {
      return json({ error: "cancelRemainingFrom must be an ISO 8601 instant" }, 400);
    }

    // Sessions and the block's money move together, under the block's row
    // lock: leaving totalCents/balanceDueCents alone would keep the live
    // balance link, the reminder ladder and the pay endpoint charging for
    // dates that no longer exist.
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(fieldRentalBlocks)
        .where(eq(fieldRentalBlocks.id, blockId))
        .for("update");
      if (!locked) return null;

      const cancelled = await tx
        .update(fieldRentals)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: "admin_override",
          paymentExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(fieldRentals.blockId, blockId),
            ne(fieldRentals.status, "cancelled"),
            gte(fieldRentals.startsAt, from),
          ),
        )
        .returning({ id: fieldRentals.id, amountDueCents: fieldRentals.amountDueCents });

      const money = applyCancellationToBlockMoney({
        totalCents: locked.totalCents,
        balanceDueCents: locked.balanceDueCents,
        cancelledAllocatedCents: cancelled.reduce((a, r) => a + r.amountDueCents, 0),
        depositPaid: locked.depositPaidAt !== null,
        balancePaid: locked.balancePaidAt !== null,
      });

      if (money.reductionCents > 0 || money.settled) {
        await tx
          .update(fieldRentalBlocks)
          .set({
            totalCents: money.totalCents,
            balanceDueCents: money.balanceDueCents,
            // Nothing left to collect and the deposit is in: stamping the
            // balance is what lets completeFinishedBlocks pick the block up and
            // stops the list flagging it overdue.
            ...(money.settled ? { balancePaidAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(fieldRentalBlocks.id, blockId));
      }

      if (money.settled) {
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
      }

      return { cancelled, money, paidCents: blockPaidCents(locked) };
    });

    if (!outcome) return ownershipDeniedResponse();
    const { cancelled, money } = outcome;

    // Ledger writes open their own transaction, so they run after the commit.
    for (const row of cancelled) await removeSourceBlock("rental", row.id);

    const suggestedRefundCents = Math.min(
      toWholeDollars(cancelled.reduce((a, r) => a + r.amountDueCents, 0)),
      outcome.paidCents,
    );
    return json(
      {
        cancelledSessionIds: cancelled.map((r) => r.id),
        suggestedRefundCents,
        reducedTotalByCents: money.reductionCents,
        totalCents: money.totalCents,
        balanceDueCents: money.balanceDueCents,
        balanceSettled: money.settled,
      },
      200,
    );
  }

  // --- metadata edit ---
  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || body.label.trim().length === 0 || body.label.length > 200) {
      return json({ error: "label must be 1-200 characters" }, 400);
    }
    updates.label = body.label.trim();
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return json({ error: "notes must be a string" }, 400);
    }
    updates.notes = body.notes;
  }

  const [updated] = await db
    .update(fieldRentalBlocks)
    .set(updates)
    .where(eq(fieldRentalBlocks.id, blockId))
    .returning();
  return json({ block: updated }, 200);
};
