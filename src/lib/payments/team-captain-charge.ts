/**
 * Pure share-math helpers for the team captain deposit/backstop flow.
 *
 * Keep this file free of Stripe (or any I/O) imports so it stays importable
 * by the unit test with no side effects. The orchestration that USES the
 * off-session charge wrapper lives in Task 6.
 */

export interface ShareLike {
  assignedShareCents: number;
  status: string;
}

/** Sum of shares not yet paid (everything except status === "paid"). */
export function sumUnpaidSharesCents(invitees: ShareLike[]): number {
  return invitees
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.assignedShareCents, 0);
}

/** Split a total evenly across N emails; earlier shares absorb the remainder. */
export function assignEvenShares(totalCents: number, emails: string[]): number[] {
  const n = emails.length;
  if (n === 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return emails.map(() => (remainder-- > 0 ? base + 1 : base));
}
