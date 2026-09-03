/**
 * THE one predicate for "does this membership owe the technical supplement
 * for this slot" — shared by the enrollment gate (enrollment.ts) and the
 * per-session booking gate (book-child.ts) so the two can never disagree.
 *
 * Unlimited tiers include technical by design (spec: the top tier stays
 * asterisk-free). A tier with no configured premium has nothing to charge,
 * so the gate stays open — this is what keeps adult/SoccerOne tiers inert.
 */
export function requiresTechnicalPremium(opts: {
  isTechnicalSlot: boolean;
  benefits: Record<string, unknown>;
  technicalMonthlyCents: number | null;
}): boolean {
  if (!opts.isTechnicalSlot) return false;
  if (opts.benefits.unlimited_classes === true) return false;
  return (opts.technicalMonthlyCents ?? 0) > 0;
}
