const OWES = new Set(["unpaid", "deposit_paid"]);

export function computeOutstandingCents(
  regs: { paymentStatus: string; amountDueCents: number; amountPaidCents: number }[],
): number {
  return regs.reduce(
    (sum, r) =>
      sum +
      (OWES.has(r.paymentStatus) ? Math.max(0, r.amountDueCents - r.amountPaidCents) : 0),
    0,
  );
}
