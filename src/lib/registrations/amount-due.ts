import { effectivePriceCents, type SeasonEarlyBird } from "@/lib/programs/early-bird";

/**
 * The amount due for a NEW registration, in cents.
 *
 * The deposit option is only honored when the deposit is a genuine partial
 * payment — strictly less than the full amount due. Seasons have carried a
 * team-sized deposit (e.g. $200) alongside a smaller solo price (e.g. $120);
 * honoring it would charge MORE than pay-in-full, and the payment step would
 * advertise "Remaining $-80.00". An invalid deposit request silently falls
 * back to the full amount rather than erroring — the customer just pays the
 * correct (smaller) full price.
 *
 * Deposits are never early-bird discounted; only the full-price component
 * honors an active early-bird window (see early-bird.ts). Display twin: the
 * `depositAvailable` guard in
 * src/components/registration/payment-step.tsx — keep the two in sync.
 */
export function registrationAmountDueCents(
  season: SeasonEarlyBird & { priceCents: number; depositCents: number | null },
  registrationType: "full" | "deposit",
  now: Date = new Date(),
): number {
  const fullPriceDueCents = effectivePriceCents(season, now);
  if (
    registrationType === "deposit" &&
    season.depositCents != null &&
    season.depositCents > 0 &&
    season.depositCents < fullPriceDueCents
  ) {
    return season.depositCents;
  }
  return fullPriceDueCents;
}
