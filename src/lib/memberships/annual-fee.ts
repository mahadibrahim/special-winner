/**
 * Annual membership fee anniversary. The fee rides the FIRST invoice as a
 * one-time Checkout line item; each anniversary this module adds a Stripe
 * invoice item so the fee rides the next monthly subscription invoice.
 *
 * Idempotency: fee_next_due_at is advanced in the same pass that creates
 * the invoice item, and the invoice-item call carries an idempotency key
 * of `${membershipId}:fee:${dueYear}` — a crashed run that already hit
 * Stripe re-sends the same key and Stripe dedupes.
 */
import type Stripe from "stripe";
import { and, eq, isNotNull, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { membershipsStripe } from "./stripe";
import { captureServerException } from "@/lib/observability/server-error";

export function nextFeeDueAt(from: Date): Date {
  const d = new Date(from.getTime());
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  // Feb 29 → setUTCFullYear rolls to Mar 1; clamp back to Feb 28.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d;
}

/** Minimal membership shape {@link buildFeeInvoiceItemParams} needs. */
export interface FeeInvoiceItemMembership {
  id: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  feeNextDueAt: Date;
}

/** Minimal tier shape {@link buildFeeInvoiceItemParams} needs. */
export interface FeeInvoiceItemTier {
  stripePriceIdFee: string;
}

/**
 * Pure assembly of the Stripe `invoiceItems.create` params + idempotency
 * key for one membership's fee anniversary. Split out from
 * {@link processDueAnnualFees} so the exact call shape — notably `pricing:
 * { price }` (NOT a top-level `price` field; that was removed from
 * `InvoiceItemCreateParams` on the installed SDK's API version) — is
 * unit-testable without a live Stripe client. Same pattern as
 * `buildSubscriptionCheckoutParams` in `./stripe.ts`.
 */
export function buildFeeInvoiceItemParams(
  m: FeeInvoiceItemMembership,
  t: FeeInvoiceItemTier,
): { params: Stripe.InvoiceItemCreateParams; idempotencyKey: string } {
  const dueYear = m.feeNextDueAt.getUTCFullYear();
  return {
    params: {
      customer: m.stripeCustomerId,
      subscription: m.stripeSubscriptionId,
      pricing: { price: t.stripePriceIdFee },
    },
    idempotencyKey: `${m.id}:fee:${dueYear}`,
  };
}

/**
 * Sweep memberships whose annual fee anniversary is due (or overdue) and
 * add a Stripe invoice item so the fee rides the membership's next monthly
 * subscription invoice. Returns per-outcome counts.
 *
 * Fee-less tiers: `handleCheckoutSessionCompleted` (webhook-handlers.ts)
 * only ever stamps `feeNextDueAt` on signup when the tier had
 * `annualFeeCents` set at that time — adult/SoccerOne tiers and fee-less
 * child tiers never get a `feeNextDueAt`. But a tier can be edited
 * *after* a membership signs up (fee removed), leaving a stale
 * `feeNextDueAt` on the membership row with no corresponding fee to
 * charge. If we just `continue`d past those, the row would be
 * re-selected by the `lte(feeNextDueAt, now)` filter on every future run
 * forever. Instead we clear `feeNextDueAt` to null here — there is no
 * fee to bill, so there is nothing to be "next due".
 *
 * Per-row failure isolation: each row's Stripe + DB work is wrapped in its
 * own try/catch (mirrors src/pages/api/cron/charge-unpaid-team-shares.ts)
 * so one membership's Stripe error doesn't abort the whole batch and leave
 * every queued row unprocessed. `feeNextDueAt` is only advanced AFTER the
 * invoice item is successfully created — a row that throws stays due for
 * the next run, and the idempotency key means a retry can't double-bill
 * even if the invoice item actually landed before the error surfaced
 * (e.g. a network blip on the response).
 */
export async function processDueAnnualFees(
  now: Date,
): Promise<{ processed: number; failed: number }> {
  const db = getDb();
  const due = await db
    .select({ m: memberships, t: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        isNotNull(memberships.feeNextDueAt),
        lte(memberships.feeNextDueAt, now),
        inArray(memberships.status, ["active", "past_due"]),
        isNotNull(memberships.stripeCustomerId),
        isNotNull(memberships.stripeSubscriptionId),
      ),
    );
  const s = membershipsStripe();
  let processed = 0;
  let failed = 0;
  for (const { m, t } of due) {
    if (t.annualFeeCents == null || !t.stripePriceIdFee) {
      // Tier no longer carries a fee (edited after this membership signed
      // up) — nothing to bill. Clear the stale due date so this row isn't
      // re-selected on every subsequent run.
      try {
        await db
          .update(memberships)
          .set({ feeNextDueAt: null, updatedAt: new Date() })
          .where(eq(memberships.id, m.id));
      } catch (err) {
        console.error(
          `[memberships] clearing stale feeNextDueAt failed for membership ${m.id}:`,
          err,
        );
        void captureServerException(err, {
          component: "memberships/annual-fee",
          metadata: { membership_id: m.id, phase: "clear-fee-less" },
        });
      }
      continue;
    }
    try {
      const { params, idempotencyKey } = buildFeeInvoiceItemParams(
        {
          id: m.id,
          stripeCustomerId: m.stripeCustomerId!,
          stripeSubscriptionId: m.stripeSubscriptionId!,
          feeNextDueAt: m.feeNextDueAt!,
        },
        { stripePriceIdFee: t.stripePriceIdFee },
      );
      await s.invoiceItems.create(params, { idempotencyKey });
      await db
        .update(memberships)
        .set({ feeNextDueAt: nextFeeDueAt(m.feeNextDueAt!), updatedAt: new Date() })
        .where(eq(memberships.id, m.id));
      processed++;
    } catch (err) {
      console.error(
        `[memberships] annual fee invoice item failed for membership ${m.id}:`,
        err,
      );
      void captureServerException(err, {
        component: "memberships/annual-fee",
        metadata: { membership_id: m.id, phase: "invoice-item" },
      });
      failed++;
    }
  }
  return { processed, failed };
}
