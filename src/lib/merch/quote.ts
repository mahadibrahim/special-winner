export interface QuoteLineInput { unitPriceCents: number; quantity: number; }

export function assembleQuote(items: QuoteLineInput[], shippingCents: number) {
  const subtotalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  return { subtotalCents, shippingCents, totalBeforeTaxCents: subtotalCents + shippingCents };
}
