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

/**
 * What the Sep-deadline backstop should charge the captain.
 *
 * Money model ("one price, every payment counts"): when the team has a
 * recorded fee, the charge is the shortfall between that fee and settled
 * money received — computed from payments, never from invitee bookkeeping,
 * so an uninvited-but-paid member (the Casey case) reduces it and an empty
 * invitee list can no longer read as "nothing owed". Legacy teams with no
 * fee recorded fall back to the old unpaid-share sum.
 */
export function teamBackstopDueCents(opts: {
  teamFeeCents: number | null;
  receivedCents: number;
  invitees: ShareLike[];
}): number {
  if (opts.teamFeeCents != null) {
    return Math.max(0, opts.teamFeeCents - opts.receivedCents);
  }
  return sumUnpaidSharesCents(opts.invitees);
}

/**
 * Youth-specific due-shortfall math for the payment-deadline cron
 * (winter-team-fixes, task 3) — deliberately SEPARATE from
 * `teamBackstopDueCents` above, which stays untouched for adult teams.
 *
 * `teamBackstopDueCents` computes its shortfall against
 * `teamMoneyReceivedCents`, which folds the captain's deposit INTO
 * "received" (nets any refund of it). That's correct for adult teams
 * (no deposit-refund lifecycle exists for them), but wrong for youth teams:
 * the deposit is refundable collateral, not a roster share, so it must
 * never be netted into "how much has the roster paid" — see
 * `teamRosterCollectedCents`' doc comment in team-funding.ts for the
 * "re-arms itself" hazard that mixing the two would create.
 *
 * `shortfallCents` — what the ROSTER still owes against the team fee,
 *   ignoring the deposit entirely. This is the number that feeds
 *   `maybeRefundTeamDeposit`'s `deadline_settle` trigger (the deposit is
 *   applied AFTER this figure, not folded into computing it).
 * `chargeCents` — what actually lands on the captain's saved card: the
 *   shortfall MINUS the deposit, which absorbs it first. Floored at zero —
 *   if the deposit alone covers the shortfall, nothing is charged.
 */
export function teamYouthDueCents(opts: {
  teamFeeCents: number;
  rosterCollectedCents: number;
  depositCents: number;
}): { shortfallCents: number; chargeCents: number } {
  const shortfallCents = Math.max(0, opts.teamFeeCents - opts.rosterCollectedCents);
  const chargeCents = Math.max(0, shortfallCents - opts.depositCents);
  return { shortfallCents, chargeCents };
}

/** Split a total evenly across N emails; earlier shares absorb the remainder. */
export function assignEvenShares(totalCents: number, emails: string[]): number[] {
  const n = emails.length;
  if (n === 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return emails.map(() => (remainder-- > 0 ? base + 1 : base));
}

// ---- Backstop orchestration (server-only; uses the Stripe wrapper) ----

import { chargeSavedCardOffSession } from "@/lib/stripe/saved-cards";

/**
 * Charge the captain's saved card for the still-unpaid teammate shares (the
 * backstop, fired by the cron after the payment deadline passes).
 *
 * Returns `ok: false` with a `reason` when there's nothing to charge or no
 * saved card on file (caller decides how to record that). `ok` reflects a
 * `succeeded` PaymentIntent — an off-session `requires_action` (3DS) comes
 * back `ok: false` with the status, which the caller treats as a failure
 * for manual follow-up.
 */
export async function chargeTeamBackstop(
  team: {
    id: string;
    captainStripeCustomerId: string | null;
    captainPaymentMethodId: string | null;
  },
  unpaidCents: number,
): Promise<{
  ok: boolean;
  paymentIntentId?: string;
  status?: string;
  reason?: string;
}> {
  if (!team.captainStripeCustomerId || !team.captainPaymentMethodId) {
    return { ok: false, reason: "no_saved_card" };
  }
  if (unpaidCents <= 0) return { ok: true, status: "nothing_owed" };

  const r = await chargeSavedCardOffSession({
    customerId: team.captainStripeCustomerId,
    paymentMethodId: team.captainPaymentMethodId,
    amountCents: unpaidCents,
    metadata: { team_registration_id: team.id, kind: "captain_backstop" },
    idempotencyKey: `team-backstop:${team.id}`,
  });

  return {
    ok: r.status === "succeeded",
    paymentIntentId: r.paymentIntentId,
    status: r.status,
  };
}
