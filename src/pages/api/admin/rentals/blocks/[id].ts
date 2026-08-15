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
 * Cancellation only SUGGESTS a refund: issuing it against the deposit and
 * balance payment intents is the refund endpoint's job.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gte, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { removeSourceBlock } from "@/lib/scheduling/blocks";
import { clearQuoteMarkers } from "@/lib/rentals/blocks/quote-markers";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Whole dollars, per the block money invariant. */
const toWholeDollars = (cents: number) => Math.round(cents / 100) * 100;

/** What the renter has actually paid so far — the refund ceiling. */
function paidCents(block: typeof fieldRentalBlocks.$inferSelect): number {
  return (
    (block.depositPaidAt ? block.depositDueCents : 0) +
    (block.balancePaidAt ? block.balanceDueCents : 0)
  );
}

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
      paidCents(block),
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

    const cancelled = await db.transaction(async (tx) => {
      return tx
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
    });

    for (const row of cancelled) await removeSourceBlock("rental", row.id);

    const suggestedRefundCents = Math.min(
      toWholeDollars(cancelled.reduce((a, r) => a + r.amountDueCents, 0)),
      paidCents(block),
    );
    return json(
      { cancelledSessionIds: cancelled.map((r) => r.id), suggestedRefundCents },
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
