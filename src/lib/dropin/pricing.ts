/**
 * Drop-in rate resolution.
 *
 * Pure function — no DB access. Callers load the rate card, the user, and
 * any active membership, then ask `resolveRate` what the user owes for the
 * session and which payment method to record on the booking row.
 *
 * Rules (in order):
 *   1. No user OR no membership → public price for the channel:
 *      - walk_up source → walk-up rate (higher in-person price)
 *      - online_booking source (default) → session rate
 *   2. Member with `unlimited_pickup` benefit → free, member_unlimited.
 *   3. Member with allotment remaining (>0) → free, member_allotment.
 *   4. Member with allotment exhausted → member rate, paid via card_online.
 *
 * Session-level overrides (`sessionRateCents`, `memberRateCents`,
 * `walkUpRateCents`) win over the rate-card defaults whenever set.
 * Members are unaffected by `source` — they always resolve via rules 2–4.
 */

export interface RateCard {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
  defaultWalkUpRateCents: number;
}

export interface SessionRateOverrides {
  sessionRateCents: number | null;
  memberRateCents: number | null;
  walkUpRateCents?: number | null;
}

export type DropInBookingSource = "online_booking" | "walk_up";

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
  source: DropInBookingSource = "online_booking",
): ResolvedRate {
  const sessionRate = session.sessionRateCents ?? rateCard.defaultSessionRateCents;
  const walkUpRate = session.walkUpRateCents ?? rateCard.defaultWalkUpRateCents;
  const memberRate = session.memberRateCents ?? rateCard.defaultMemberRateCents;

  // No user, or no membership: pay the public price for this channel —
  // walk-ins pay the (higher) walk-up rate, online pays the session rate.
  if (!user || !membership) {
    return {
      amountCents: source === "walk_up" ? walkUpRate : sessionRate,
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
