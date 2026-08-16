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
 * Sequencing (this is the whole point of the three phases below, and mirrors
 * `handle-field-rental-checkout-complete.ts`):
 *
 *  1. A SHORT transaction takes `FOR UPDATE` on the block, validates the ask,
 *     splits it across the deposit and balance legs, and DEDUCTS the planned
 *     amounts before anything is sent to Stripe. Deducting first is deliberate:
 *     if the request dies mid-flight the block reads as less refundable than it
 *     is, which is the safe direction. Rolling the deduction back after a
 *     successful refund would be the unsafe one: the same dollars could be
 *     refunded for real a second time.
 *  2. `stripe.refunds.create` runs with NO row lock held. `lifecycle.ts` states
 *     the invariant plainly: a Stripe call takes seconds, and webhooks and cron
 *     sweeps must never queue behind one. The idempotency key is block id +
 *     leg + the attempt timestamp persisted in phase 1: it deliberately does
 *     NOT embed `depositDueCents`/`balanceDueCents`, which this endpoint
 *     mutates, so a retry can never collide with a different refund's key.
 *  3. A second SHORT transaction restores whatever Stripe REJECTED, using
 *     relative SQL arithmetic so a concurrent writer's change is preserved.
 *     Whatever Stripe accepted stays deducted, even when the other leg failed:
 *     rolling that away would lose the record of money that genuinely left.
 *
 * A block settled offline (cash/comp) never touched Stripe, so its refund is
 * pure bookkeeping and phase 2 is a no-op.
 */
import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
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

interface PlannedLeg {
  leg: "deposit" | "balance";
  amountCents: number;
  paymentIntentId: string | null;
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

  // --- phase 1: validate, plan, and deduct under the row lock ---
  const planned = await db.transaction(async (tx) => {
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

    const legs: PlannedLeg[] = [];
    if (fromDeposit > 0) {
      legs.push({
        leg: "deposit",
        amountCents: fromDeposit,
        paymentIntentId: block.stripeDepositPiId,
      });
    }
    if (fromBalance > 0) {
      legs.push({
        leg: "balance",
        amountCents: fromBalance,
        paymentIntentId: block.stripeBalancePiId,
      });
    }

    // The block row is the payment truth, so the deduction comes off the
    // figures `blockPaidCents` reads, which is what caps a second refund.
    // Committed BEFORE the Stripe call; phase 3 restores any leg Stripe
    // rejects.
    const attemptAt = new Date();
    await tx
      .update(fieldRentalBlocks)
      .set({
        depositDueCents: block.depositDueCents - fromDeposit,
        balanceDueCents: block.balanceDueCents - fromBalance,
        updatedAt: attemptAt,
      })
      .where(eq(fieldRentalBlocks.id, blockId));

    return {
      kind: "planned" as const,
      // Cash and comp blocks never touched Stripe, so there is nothing to call:
      // the refund is a bookkeeping entry the admin settles by hand.
      offline: block.offlinePaymentMethod !== null,
      legs,
      paidCents: paid,
      attemptAt,
    };
  });

  if (planned.kind === "denied") return ownershipDeniedResponse();
  if (planned.kind === "unpaid") {
    return json({ error: "This block has no payment to refund" }, 422);
  }
  if (planned.kind === "over") {
    return json(
      {
        error: `This block has only been paid $${Math.round(planned.paidCents / 100).toLocaleString("en-US")}`,
        paidCents: planned.paidCents,
      },
      422,
    );
  }

  // --- phase 2: Stripe, with no lock held ---
  const { offline, legs: plan, attemptAt } = planned;
  // Stable per attempt and free of any mutable amount: the deduction in phase 1
  // is what makes two genuine refunds distinct, not the figure being refunded.
  const nonce = attemptAt.getTime();
  const legs: RefundLeg[] = [];
  for (const leg of plan) {
    if (offline) {
      legs.push({ ...leg, refundId: null, error: null });
      continue;
    }
    const result = await refundBlockPayment(
      leg.paymentIntentId,
      leg.amountCents,
      `${blockId}:refund:${leg.leg}:${nonce}`,
    );
    legs.push({ leg: leg.leg, amountCents: leg.amountCents, ...result });
  }

  const settled = legs.filter((l) => offline || l.refundId !== null);
  const failed = legs.filter((l) => !offline && l.refundId === null);
  const refundedCents = settled.reduce((a, l) => a + l.amountCents, 0);

  // --- phase 3: give back what Stripe would not take ---
  if (failed.length > 0) {
    const depositBack = failed.find((l) => l.leg === "deposit")?.amountCents ?? 0;
    const balanceBack = failed.find((l) => l.leg === "balance")?.amountCents ?? 0;
    // Relative arithmetic, not the values read in phase 1: a webhook or a
    // second admin may have moved these columns while Stripe was answering.
    await db
      .update(fieldRentalBlocks)
      .set({
        ...(depositBack > 0
          ? { depositDueCents: sql`${fieldRentalBlocks.depositDueCents} + ${depositBack}` }
          : {}),
        ...(balanceBack > 0
          ? { balanceDueCents: sql`${fieldRentalBlocks.balanceDueCents} + ${balanceBack}` }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(fieldRentalBlocks.id, blockId));

    await logAlert("rental_block_refund_failed", {
      blockId,
      requestedCents: amountCents,
      refundedCents,
      failed: failed.map((l) => ({
        leg: l.leg,
        amountCents: l.amountCents,
        error: l.error,
      })),
    });
    return json(
      {
        error:
          refundedCents > 0
            ? "Part of the refund did not go through; refund the rest in Stripe by hand"
            : "The refund did not go through",
        refundedCents,
        remainingPaidCents: planned.paidCents - refundedCents,
        refunds: legs,
      },
      502,
    );
  }

  return json(
    {
      refundedCents,
      remainingPaidCents: planned.paidCents - refundedCents,
      offline,
      refunds: legs,
    },
    200,
  );
};
