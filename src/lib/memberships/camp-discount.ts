/** Member camp discount — pure math, clamped like rental_discount_pct. */
export function computeMemberCampDiscountCents(
  amountDueCents: number,
  benefits: Record<string, unknown>,
): number {
  const pct = Number(benefits.camp_discount_pct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
  return Math.round((amountDueCents * pct) / 100);
}
