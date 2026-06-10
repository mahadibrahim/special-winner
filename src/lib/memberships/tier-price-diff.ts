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
