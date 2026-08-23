/**
 * Annual membership fee anniversary. The fee rides the FIRST invoice as a
 * one-time Checkout line item; each anniversary this module adds a Stripe
 * invoice item so the fee rides the next monthly subscription invoice.
 *
 * Idempotency: fee_next_due_at is advanced in the same pass that creates
 * the invoice item, and the invoice-item call carries an idempotency key
 * of `${membershipId}:fee:${dueYear}` — a crashed run that already hit
 * Stripe re-sends the same key and Stripe dedupes.
 *
 * NOTE: this file currently exposes only `nextFeeDueAt`, pulled forward
 * from Task 7 because Task 5 (child subscribe checkout) needs it to stamp
 * `feeNextDueAt` on the membership row at signup time. Task 7 fills in the
 * rest of the module (`processDueAnnualFees` + the cron route).
 */
export function nextFeeDueAt(from: Date): Date {
  const d = new Date(from.getTime());
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  // Feb 29 → setUTCFullYear rolls to Mar 1; clamp back to Feb 28.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d;
}
