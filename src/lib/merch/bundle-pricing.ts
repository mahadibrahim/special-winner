/**
 * Pure bundle pricing math for merch bundles.
 *
 * No DB, no network, no side effects — every function here is a pure
 * function of its inputs so it can be unit tested exhaustively and reused
 * both server-side (checkout/quote) and client-side (cart preview).
 *
 * All money values are integer cents.
 */

export interface BundleComponent {
  unitPriceCents: number;
  quantity: number;
}

/** Sum of unitPriceCents × quantity across all components. */
export function bundleFullCents(components: BundleComponent[]): number {
  return components.reduce((sum, c) => sum + c.unitPriceCents * c.quantity, 0);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Apply a bundle-level discount to the full price.
 * - percent: value is clamped to [0, 100]; discount reduces the total by that percent.
 * - fixed: value is a flat cents-off amount; result is clamped at 0 (never negative).
 */
export function bundleDiscountedCents(
  full: number,
  type: "percent" | "fixed",
  value: number,
): number {
  if (type === "percent") {
    const pct = clampPercent(value);
    return Math.round((full * (100 - pct)) / 100);
  }
  return Math.max(0, full - value);
}

/**
 * Distribute a bundle's discounted total back across its components
 * (proportional to each component's extended price = unitPriceCents × quantity),
 * using the largest-remainder (Hamilton) method so the parts sum EXACTLY to
 * `discounted` — never a cent more or less.
 *
 * Returns one integer-cents value per component, in the same order as the input.
 */
export function distributeBundleDiscount(
  components: BundleComponent[],
  discounted: number,
): number[] {
  const full = bundleFullCents(components);

  if (full === 0) {
    return components.map(() => 0);
  }

  const extended = components.map((c) => c.unitPriceCents * c.quantity);

  const rawShares = extended.map((e) => (e * discounted) / full);
  const floors = rawShares.map((s) => Math.floor(s));
  const remainders = rawShares.map((s, i) => s - floors[i]);

  const flooredSum = floors.reduce((a, b) => a + b, 0);
  let leftover = discounted - flooredSum;

  // Rank indices by largest fractional remainder first; ties broken by
  // lower index (stable sort preserves original relative order on ties).
  const order = components.map((_, i) => i);
  order.sort((a, b) => remainders[b] - remainders[a] || a - b);

  const result = [...floors];
  for (let k = 0; k < order.length && leftover > 0; k++) {
    result[order[k]] += 1;
    leftover -= 1;
  }

  return result;
}
