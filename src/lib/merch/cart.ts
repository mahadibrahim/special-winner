import type { OrderItemPersonalization } from "@/lib/db/schema";

// Local union (Slice 2 predates a shared export in Slice 3). Keep in sync
// with merchFulfillmentTypeEnum.
export type CartFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital" | "lulu_pod";

export interface CartItem {
  kind?: "product";
  variantId: string;
  productSlug: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  imageUrl: string | null;
  printfulSyncVariantId: string | null;
  storeId: string;
  storeSlug: string;
  // Optional: set by product-detail when adding to cart; drives pickup-only
  // checkout. Not required by the merge/subtotal helpers themselves.
  fulfillmentType?: CartFulfillmentType;
  personalization?: OrderItemPersonalization;
  lineId?: string; // set for personalized lines so they never merge
  quantity: number;
}

/** One slot's resolved choice, carried on a bundle cart line for display + checkout submission. */
export interface CartBundleSelection {
  slotId: string;
  productId: string;
  variantId: string;
  label: string;
  size: string | null;
}

/**
 * A bundle cart line (merch Phase 3d). Distinct from a `CartItem` — a bundle
 * is one purchasable unit made of several slot selections, priced at the
 * bundle's discounted rate (server re-verifies at quote/checkout time; this
 * is display-only). Always carries a `lineId` because two bundle lines with
 * the same `bundleId` but different selections (or even identical
 * selections added twice) must never merge into one line.
 */
export interface CartBundleItem {
  kind: "bundle";
  lineId: string;
  bundleId: string;
  bundleSlug: string;
  storeId: string;
  storeSlug: string;
  fulfillmentType: CartFulfillmentType;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  selections: CartBundleSelection[];
  quantity: number;
}

/** A single cart line: either a free-standing product or a bundle. */
export type CartLine = CartItem | CartBundleItem;

export function isBundleLine(line: CartLine): line is CartBundleItem {
  return line.kind === "bundle";
}

/** The key that identifies one cart line for setQty/remove — always stable and unique per line. */
export function cartLineKey(line: CartLine): string {
  return isBundleLine(line) ? line.lineId : (line.lineId ?? line.variantId);
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
}

/** Total physical/line quantity across the cart (badge count). */
export function cartLineCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** The single store this cart belongs to, or null if empty. Carts are single-store. */
export function cartStoreId(lines: CartLine[]): string | null {
  return lines.length ? lines[0].storeId : null;
}

/**
 * Merge a new line into the cart. Bundle lines are always distinct (keyed by
 * `lineId`) and are never merged with anything, even an identical bundle +
 * selections added twice. Product-line merge behavior (personalization-aware,
 * variant-matching) is unchanged from Slice 2, and only ever matches against
 * other product lines in the cart.
 */
export function mergeCartItem(lines: CartLine[], line: CartLine): CartLine[] {
  if (isBundleLine(line)) {
    return [...lines, line];
  }
  // Personalized lines are always distinct (keyed by lineId) — never merge.
  if (line.personalization && (line.personalization.name || line.personalization.number)) {
    return [...lines, line];
  }
  const existing = lines.find((l) => !isBundleLine(l) && l.variantId === line.variantId && !l.lineId);
  if (!existing) return [...lines, line];
  return lines.map((l) =>
    !isBundleLine(l) && l.variantId === line.variantId && !l.lineId
      ? { ...l, quantity: l.quantity + line.quantity }
      : l,
  );
}

/**
 * Full "add to cart" decision: carts are single-store, so adding a line from
 * a different store than the current cart replaces it wholesale rather than
 * mixing stores. Applies identically to product and bundle lines (both carry
 * `storeId`). Pulled out of the `useCart` hook so the store-replace rule is
 * unit-testable without a DOM.
 */
export function addLineToCart(lines: CartLine[], line: CartLine): CartLine[] {
  const sameStore = lines.length === 0 || lines[0].storeId === line.storeId;
  return sameStore ? mergeCartItem(lines, line) : [line];
}
