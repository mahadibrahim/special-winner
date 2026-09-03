export type Interval = "month" | "year";

export type PriceAction =
  | { interval: Interval; action: "noop" }
  | { interval: Interval; action: "create"; amountCents: number }
  | { interval: Interval; action: "archive"; oldPriceId: string }
  | { interval: Interval; action: "replace"; amountCents: number; oldPriceId: string };

type OldState = {
  monthlyCents: number | null;
  annualCents: number | null;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
};
type NextAmounts = { monthlyCents: number | null; annualCents: number | null };

function diffOne(interval: Interval, oldCents: number | null, oldPriceId: string | null, nextCents: number | null): PriceAction {
  // A null price id means there is no live Stripe Price to archive or
  // replace, regardless of what oldCents says — guards against drift (a
  // row with cents set but no id on record, from a race or a bad
  // historical write). Treating the id as the source of truth self-heals:
  // it falls through to "create" instead of asserting a null id into
  // prices.update.
  const effectiveOldCents = oldPriceId == null ? null : oldCents;
  if (effectiveOldCents == null && nextCents == null) return { interval, action: "noop" };
  if (effectiveOldCents == null && nextCents != null) return { interval, action: "create", amountCents: nextCents };
  if (effectiveOldCents != null && nextCents == null) return { interval, action: "archive", oldPriceId: oldPriceId! };
  if (effectiveOldCents === nextCents) return { interval, action: "noop" };
  return { interval, action: "replace", amountCents: nextCents!, oldPriceId: oldPriceId! };
}

export function diffTierPrices(old: OldState, next: NextAmounts): PriceAction[] {
  return [
    diffOne("month", old.monthlyCents, old.monthlyPriceId, next.monthlyCents),
    diffOne("year", old.annualCents, old.annualPriceId, next.annualCents),
  ];
}

/**
 * Diff logic shared by the two "supplement" prices that don't carry a
 * Stripe recurring `interval` discriminator the way month/year do: the
 * one-time annual fee price and the recurring-monthly technical-training
 * supplement price. Both follow the same create/replace/archive/noop
 * contract in `applyTierStripeEdits` — create-then-archive on replace so a
 * failed create never leaves the stored price id pointing at an archived
 * Price.
 */
export type SupplementPriceAction =
  | { action: "noop" }
  | { action: "create"; amountCents: number }
  | { action: "archive"; oldPriceId: string }
  | { action: "replace"; amountCents: number; oldPriceId: string };

export function diffSupplementPrice(
  oldCents: number | null,
  oldPriceId: string | null,
  nextCents: number | null,
): SupplementPriceAction {
  // Same drift guard as diffOne: a null price id means there is nothing to
  // archive/replace on Stripe's side no matter what oldCents says, so treat
  // it as if there were no old price at all. This keeps a null id from
  // ever reaching prices.update, and self-heals the row by creating a
  // fresh price the next time it's edited.
  const effectiveOldCents = oldPriceId == null ? null : oldCents;
  if (effectiveOldCents == null && nextCents == null) return { action: "noop" };
  if (effectiveOldCents == null && nextCents != null) return { action: "create", amountCents: nextCents };
  if (effectiveOldCents != null && nextCents == null) return { action: "archive", oldPriceId: oldPriceId! };
  if (effectiveOldCents === nextCents) return { action: "noop" };
  return { action: "replace", amountCents: nextCents!, oldPriceId: oldPriceId! };
}
