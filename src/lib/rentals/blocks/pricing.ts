/**
 * Pure pricing for recurring rental blocks.
 *
 * Money invariant: every value returned here is a whole number of dollars
 * (a multiple of 100 cents). Cents exist only because Stripe and the rest of
 * the schema store minor units; no cent ever reaches the UI or the
 * arithmetic. Per-session allocation sums EXACTLY to totalCents, with the
 * remainder dollars on the first session.
 *
 * Storefront drives pricing: "soccerone" uses the seasonal x time-of-day
 * tiers, everything else the flat hourly rate. Never read locals.brandId
 * here, because an admin may build a SoccerOne block from the Aspire host.
 */
import type { GeneratedSession } from "./generate";
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing";
import { computeRentalPriceCents, resolveRentalHourlyRateCents } from "@/lib/rentals/pricing";

export type BlockDiscount = { kind: "percent" | "amount"; value: number } | null;

export interface BlockPricingContext {
  brand: "soccerone" | "aspire";
  timeZone: string;
  /** venueId to per-venue hourly override, if any. */
  venueHourlyRateCents: Record<string, number | null>;
  defaultHourlyRateCents: number;
}

export interface PricedSession extends GeneratedSession {
  rateCardCents: number;
  allocatedCents: number;
}

export interface BlockQuote {
  sessions: PricedSession[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositDueCents: number;
  balanceDueCents: number;
}

const DOLLAR = 100;

/** Round to the nearest whole dollar. */
function toWholeDollars(cents: number): number {
  return Math.round(cents / DOLLAR) * DOLLAR;
}

export function priceSession(s: GeneratedSession, ctx: BlockPricingContext): number {
  if (ctx.brand === "soccerone") {
    return quoteRentalCents(s.startsAt, s.endsAt, ctx.timeZone);
  }
  const hourly = resolveRentalHourlyRateCents(
    ctx.venueHourlyRateCents[s.venueId] ?? null,
    ctx.defaultHourlyRateCents,
  );
  return computeRentalPriceCents(s.startsAt, s.endsAt, hourly);
}

export function quoteBlock(
  sessions: GeneratedSession[],
  ctx: BlockPricingContext,
  opts: { discount: BlockDiscount; depositPct: number },
): BlockQuote {
  const rated = sessions.map((s) => ({
    ...s,
    rateCardCents: toWholeDollars(priceSession(s, ctx)),
  }));
  const subtotalCents = rated.reduce((a, s) => a + s.rateCardCents, 0);

  const rawDiscount =
    opts.discount === null
      ? 0
      : opts.discount.kind === "percent"
        ? (subtotalCents * opts.discount.value) / 100
        : opts.discount.value;
  const discountCents = Math.min(toWholeDollars(rawDiscount), subtotalCents);
  const totalCents = subtotalCents - discountCents;

  const depositDueCents = Math.min(
    toWholeDollars((totalCents * opts.depositPct) / 100),
    totalCents,
  );
  const balanceDueCents = totalCents - depositDueCents;

  // Whole-dollar allocation: even share to every session, remainder dollars
  // onto the first so the parts sum exactly to totalCents.
  const sessionsOut: PricedSession[] = [];
  if (rated.length > 0) {
    const share = Math.floor(totalCents / rated.length / DOLLAR) * DOLLAR;
    const remainder = totalCents - share * rated.length;
    rated.forEach((s, i) => {
      sessionsOut.push({ ...s, allocatedCents: i === 0 ? share + remainder : share });
    });
  }

  return {
    sessions: sessionsOut,
    subtotalCents,
    discountCents,
    totalCents,
    depositDueCents,
    balanceDueCents,
  };
}

export function balanceDueAt(firstSessionStartsAt: Date, leadDays: number): Date {
  return new Date(firstSessionStartsAt.getTime() - leadDays * 24 * 3_600_000);
}

export interface CancellationMoneyInput {
  /** The block's current totalCents. */
  totalCents: number;
  /** The block's current balanceDueCents. */
  balanceDueCents: number;
  /** Sum of the cancelled sessions' allocatedCents (`amount_due_cents`). */
  cancelledAllocatedCents: number;
  depositPaid: boolean;
  balancePaid: boolean;
}

export interface CancellationMoneyResult {
  /** How much came off the block. Always a multiple of 100, never negative. */
  reductionCents: number;
  totalCents: number;
  balanceDueCents: number;
  /**
   * Nothing is left to collect and the deposit is in: the caller stamps
   * `balancePaidAt` and flips the surviving sessions to `paid`, so the block
   * can reach `completed` instead of sitting there looking overdue.
   */
  settled: boolean;
}

/**
 * Cancelling sessions has to take their money off the block, or the live
 * balance link, the reminder ladder and the pay endpoint all keep charging for
 * dates that no longer exist.
 *
 * Only the UNPAID balance is reducible. Money already collected is the refund
 * endpoint's business (the PATCH still returns `suggestedRefundCents` for it),
 * and the deposit figure is left alone because a deposit link quoting it may
 * already be in the renter's inbox. Reducing exactly the balance keeps the
 * `total = deposit + balance` invariant, keeps every figure a whole number of
 * dollars, and is what floors `totalCents` at `blockPaidCents`: what is left
 * after the reduction is always at least the deposit that was paid.
 */
export function applyCancellationToBlockMoney(
  input: CancellationMoneyInput,
): CancellationMoneyResult {
  const reducible = input.balancePaid ? 0 : Math.max(0, input.balanceDueCents);
  const asked = Math.max(0, toWholeDollars(input.cancelledAllocatedCents));
  const reductionCents = Math.min(asked, reducible);

  const balanceDueCents = input.balanceDueCents - reductionCents;
  return {
    reductionCents,
    totalCents: input.totalCents - reductionCents,
    balanceDueCents,
    settled: !input.balancePaid && input.depositPaid && balanceDueCents === 0,
  };
}
