/**
 * Captain deposit-credit math (pure functions, no I/O).
 *
 * The captain pays a $200 team deposit up front. When they then register
 * themselves as a player on their own team, their share is credited by that
 * deposit instead of being charged again (the live double-charge bug: deposit
 * paid, then "Register myself" quoted the full individual price with no
 * credit). The typical result is $0 due; a captain-assigned share larger than
 * the deposit leaves `share − deposit` due.
 *
 * Server twin: `createRegistration` recomputes this credit itself from the
 * team_registrations row — it never trusts a client-sent amount. Display
 * twins: the payment-step credit summary and `viewerCaptainCredit` on
 * GET /api/public/team-registrations/[token].
 */

/** Portion of the deposit that applies against the captain's share. */
export function captainDepositCreditCents(
  shareCents: number,
  depositPaidCents: number,
): number {
  return Math.min(Math.max(0, shareCents), Math.max(0, depositPaidCents));
}

/** Amount still due for the captain's own registration after the credit. */
export function captainShareDueCents(
  shareCents: number,
  depositPaidCents: number,
): number {
  return Math.max(0, shareCents - Math.max(0, depositPaidCents));
}

export interface CollectedInviteeLike {
  assignedShareCents: number | null;
  status: string;
  /** True when this invitee row is the captain's own (email match). */
  isCaptain: boolean;
}

/**
 * Total collected toward the team fee for the payment tracker.
 *
 * The deposit is counted once, up front. Paid invitee shares are added on
 * top — EXCEPT the captain's own row, which is capped at
 * `max(0, share − deposit)`: the deposit already covers the first $deposit of
 * the captain's share (see the credit math above), so counting the deposit
 * AND the captain's full share would double-count the overlap. A captain
 * share fully covered by the deposit therefore adds nothing.
 */
export function teamCollectedCents(input: {
  depositCents: number;
  invitees: CollectedInviteeLike[];
}): number {
  const depositCents = Math.max(0, input.depositCents);
  return input.invitees.reduce((sum, invitee) => {
    if (invitee.status !== "paid") return sum;
    const share = Math.max(0, invitee.assignedShareCents ?? 0);
    return sum + (invitee.isCaptain ? Math.max(0, share - depositCents) : share);
  }, depositCents);
}

/**
 * Whether the team's deposit has actually been paid, per the webhook-written
 * state on the team_registrations row (`handle-team-deposit-succeeded.ts`
 * flips backstopStatus off "none" and records depositPaymentId). The credit
 * must never be granted for a team whose deposit was started but never paid.
 */
export function teamDepositPaid(team: {
  backstopStatus: string;
  depositPaymentId: string | null;
}): boolean {
  return team.backstopStatus !== "none" || team.depositPaymentId != null;
}
