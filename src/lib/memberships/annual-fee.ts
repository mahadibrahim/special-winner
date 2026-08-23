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

export function nextFeeDueAt(from: Date): Date {
  const d = new Date(from.getTime());
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  // Feb 29 → setUTCFullYear rolls to Mar 1; clamp back to Feb 28.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d;
}

/**
 * Sweep memberships whose annual fee anniversary is due (or overdue) and
 * add a Stripe invoice item so the fee rides the membership's next monthly
 * subscription invoice. Returns the number of memberships that had a fee
 * invoice item created.
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
 */
export async function processDueAnnualFees(now: Date): Promise<number> {
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
  for (const { m, t } of due) {
    if (t.annualFeeCents == null || !t.stripePriceIdFee) {
      // Tier no longer carries a fee (edited after this membership signed
      // up) — nothing to bill. Clear the stale due date so this row isn't
      // re-selected on every subsequent run.
      await db
        .update(memberships)
        .set({ feeNextDueAt: null, updatedAt: new Date() })
        .where(eq(memberships.id, m.id));
      continue;
    }
    const dueYear = m.feeNextDueAt!.getUTCFullYear();
    await s.invoiceItems.create(
      {
        customer: m.stripeCustomerId!,
        subscription: m.stripeSubscriptionId!,
        price: t.stripePriceIdFee,
      } as Stripe.InvoiceItemCreateParams,
      { idempotencyKey: `${m.id}:fee:${dueYear}` },
    );
    await db
      .update(memberships)
      .set({ feeNextDueAt: nextFeeDueAt(m.feeNextDueAt!), updatedAt: new Date() })
      .where(eq(memberships.id, m.id));
    processed++;
  }
  return processed;
}
