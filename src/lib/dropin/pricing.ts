/**
 * Drop-in rate resolution.
 *
 * Pure function — no DB access. Callers load the rate card, the user, and
 * any active membership, then ask `resolveRate` what the user owes for the
 * session and which payment method to record on the booking row.
 *
 * Rules (in order):
 *   1. No user OR no membership → full session rate, paid via card_online.
 *   2. Member with `unlimited_pickup` benefit → free, member_unlimited.
 *   3. Member with allotment remaining (>0) → free, member_allotment.
 *   4. Member with allotment exhausted → member rate, paid via card_online.
 *
 * Session-level overrides (`sessionRateCents`, `memberRateCents`) win over
 * the rate-card defaults whenever set.
 */

export interface RateCard {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
}

export interface SessionRateOverrides {
  sessionRateCents: number | null;
  memberRateCents: number | null;
}

export interface MembershipForPricing {
  id: string;
  tier: {
    benefits: {
      unlimited_pickup?: boolean;
      free_pickup_per_month?: number;
    };
  };
  allotmentRemaining: number;
}

export type DropInPaymentMethod =
  | "card_online"
  | "card_present"
  | "member_unlimited"
  | "member_allotment";

export interface ResolvedRate {
  amountCents: number;
  paymentMethod: DropInPaymentMethod;
  membershipId: string | null;
}

export function resolveRate(
  session: SessionRateOverrides,
  user: { id: string } | null,
  membership: MembershipForPricing | null,
  rateCard: RateCard,
): ResolvedRate {
  const sessionRate = session.sessionRateCents ?? rateCard.defaultSessionRateCents;
  const memberRate = session.memberRateCents ?? rateCard.defaultMemberRateCents;

  // No user, or no membership: pay the public session rate.
  if (!user || !membership) {
    return {
      amountCents: sessionRate,
      paymentMethod: "card_online",
      membershipId: null,
    };
  }

  // Unlimited tier: free.
  if (membership.tier.benefits.unlimited_pickup) {
    return {
      amountCents: 0,
      paymentMethod: "member_unlimited",
      membershipId: membership.id,
    };
  }

  // Allotment tier with credits remaining: free.
  if (membership.allotmentRemaining > 0) {
    return {
      amountCents: 0,
      paymentMethod: "member_allotment",
      membershipId: membership.id,
    };
  }

  // Member but out of allotment: pay the discounted member rate.
  return {
    amountCents: memberRate,
    paymentMethod: "card_online",
    membershipId: membership.id,
  };
}
