/**
 * POST /api/admin/rentals/blocks/:id/refund
 *
 * Issue a whole-dollar refund against the block's payment intents, deposit
 * first then balance. Cancelling sessions only SUGGESTS an amount (see the
 * PATCH on the block); the admin confirms the figure here, so this endpoint is
 * the only place block money moves back.
 *
 * Body: { amountCents: number }: a multiple of 100, never more than the block
 * has actually been paid.
 *
 * Mirrors the structure of `@/lib/rentals/refund.ts`: the block is read
 * `FOR UPDATE` so two admins cannot each refund the same dollars, and a block
 * settled offline (cash/comp) is recorded without a Stripe call. Whatever
 * Stripe accepted is always written back, even when the second leg fails:
 * rolling that away would lose the record of money that genuinely left.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { blockPaidCents, refundBlockPayment } from "@/lib/rentals/blocks/lifecycle";
import { logAlert } from "@/lib/logging/alerts";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface RefundLeg {
  leg: "deposit" | "balance";
  amountCents: number;
  refundId: string | null;
  error: string | null;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const blockId = context.params.id;
  if (!blockId) return json({ error: "block id required" }, 400);

  let body: { amountCents?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const amountCents = body.amountCents;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    return json({ error: "amountCents must be a positive integer" }, 400);
  }
  // Whole dollars everywhere in the block feature: there is no cents input in
  // the UI, and a $12.34 refund would be un-representable in every figure the
  // renter has seen.
  if (amountCents % 100 !== 0) {
    return json({ error: "amountCents must be a whole number of dollars" }, 400);
  }

  const db = getDb();

  const outcome = await db.transaction(async (tx) => {
    const [block] = await tx
      .select()
      .from(fieldRentalBlocks)
      .where(eq(fieldRentalBlocks.id, blockId))
      .for("update");
    if (!block || block.organizationId !== auth.organizationId) {
      return { kind: "denied" as const };
    }

    const paid = blockPaidCents(block);
    if (paid === 0) return { kind: "unpaid" as const };
    if (amountCents > paid) {
      return { kind: "over" as const, paidCents: paid };
    }

    // Deposit first, then whatever is left comes off the balance.
    const depositHeld = block.depositPaidAt ? block.depositDueCents : 0;
    const fromDeposit = Math.min(amountCents, depositHeld);
    const fromBalance = amountCents - fromDeposit;

    // Cash and comp blocks never touched Stripe, so there is nothing to call:
    // the refund is a bookkeeping entry the admin settles by hand.
    const offline = block.offlinePaymentMethod !== null;
    const legs: RefundLeg[] = [];

    if (fromDeposit > 0) {
      const result = offline
        ? { refundId: null, error: null }
        : await refundBlockPayment(
            block.stripeDepositPiId,
            fromDeposit,
            `${block.id}:refund:deposit:${block.depositDueCents}:${fromDeposit}`,
          );
      legs.push({ leg: "deposit", amountCents: fromDeposit, ...result });
    }
    if (fromBalance > 0) {
      const result = offline
        ? { refundId: null, error: null }
        : await refundBlockPayment(
            block.stripeBalancePiId,
            fromBalance,
            `${block.id}:refund:balance:${block.balanceDueCents}:${fromBalance}`,
          );
      legs.push({ leg: "balance", amountCents: fromBalance, ...result });
    }

    const settled = legs.filter((l) => offline || l.refundId !== null);
    const failed = legs.filter((l) => !offline && l.refundId === null);
    const refundedCents = settled.reduce((a, l) => a + l.amountCents, 0);

    // The block row is the payment truth, so the refund comes off the figures
    // `blockPaidCents` reads, which is what caps a second refund.
    if (refundedCents > 0) {
      const depositRefunded = settled.find((l) => l.leg === "deposit")?.amountCents ?? 0;
      const balanceRefunded = settled.find((l) => l.leg === "balance")?.amountCents ?? 0;
      await tx
        .update(fieldRentalBlocks)
        .set({
          depositDueCents: block.depositDueCents - depositRefunded,
          balanceDueCents: block.balanceDueCents - balanceRefunded,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentalBlocks.id, blockId));
    }

    return {
      kind: "done" as const,
      offline,
      legs,
      failed,
      refundedCents,
      remainingPaidCents: paid - refundedCents,
    };
  });

  if (outcome.kind === "denied") return ownershipDeniedResponse();
  if (outcome.kind === "unpaid") {
    return json({ error: "This block has no payment to refund" }, 422);
  }
  if (outcome.kind === "over") {
    return json(
      {
        error: `This block has only been paid $${Math.round(outcome.paidCents / 100).toLocaleString("en-US")}`,
        paidCents: outcome.paidCents,
      },
      422,
    );
  }

  if (outcome.failed.length > 0) {
    await logAlert("rental_block_refund_failed", {
      blockId,
      requestedCents: amountCents,
      refundedCents: outcome.refundedCents,
      failed: outcome.failed.map((l) => ({
        leg: l.leg,
        amountCents: l.amountCents,
        error: l.error,
      })),
    });
    return json(
      {
        error:
          outcome.refundedCents > 0
            ? "Part of the refund did not go through; refund the rest in Stripe by hand"
            : "The refund did not go through",
        refundedCents: outcome.refundedCents,
        remainingPaidCents: outcome.remainingPaidCents,
        refunds: outcome.legs,
      },
      502,
    );
  }

  return json(
    {
      refundedCents: outcome.refundedCents,
      remainingPaidCents: outcome.remainingPaidCents,
      offline: outcome.offline,
      refunds: outcome.legs,
    },
    200,
  );
};
