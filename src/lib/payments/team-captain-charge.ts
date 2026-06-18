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
