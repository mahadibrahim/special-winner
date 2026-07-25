export interface CartItem {
  variantId: string;
  productSlug: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  imageUrl: string | null;
  printfulSyncVariantId: string;
  quantity: number;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

export function mergeCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((i) => i.variantId === item.variantId);
  if (!existing) return [...items, item];
  return items.map((i) =>
    i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i,
  );
}
