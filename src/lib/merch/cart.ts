import type { OrderItemPersonalization } from "@/lib/db/schema";

// Local union (Slice 2 predates a shared export in Slice 3). Keep in sync
// with merchFulfillmentTypeEnum.
export type CartFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital";

export interface CartItem {
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

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

/** The single store this cart belongs to, or null if empty. Carts are single-store. */
export function cartStoreId(items: CartItem[]): string | null {
  return items.length ? items[0].storeId : null;
}

export function mergeCartItem(items: CartItem[], item: CartItem): CartItem[] {
  // Personalized lines are always distinct (keyed by lineId) — never merge.
  if (item.personalization && (item.personalization.name || item.personalization.number)) {
    return [...items, item];
  }
  const existing = items.find((i) => i.variantId === item.variantId && !i.lineId);
  if (!existing) return [...items, item];
  return items.map((i) =>
    i.variantId === item.variantId && !i.lineId ? { ...i, quantity: i.quantity + item.quantity } : i,
  );
}
