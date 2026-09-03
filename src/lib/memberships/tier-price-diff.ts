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
  if (oldCents == null && nextCents == null) return { interval, action: "noop" };
  if (oldCents == null && nextCents != null) return { interval, action: "create", amountCents: nextCents };
  if (oldCents != null && nextCents == null) return { interval, action: "archive", oldPriceId: oldPriceId! };
  if (oldCents === nextCents) return { interval, action: "noop" };
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
  if (oldCents == null && nextCents == null) return { action: "noop" };
  if (oldCents == null && nextCents != null) return { action: "create", amountCents: nextCents };
  if (oldCents != null && nextCents == null) return { action: "archive", oldPriceId: oldPriceId! };
  if (oldCents === nextCents) return { action: "noop" };
  return { action: "replace", amountCents: nextCents!, oldPriceId: oldPriceId! };
}
