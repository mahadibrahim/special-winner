/**
 * Typed wrappers around window.dataLayer.push for GA4 ecommerce events.
 *
 * Each helper:
 * 1. Pushes { ecommerce: null } first (per GA4 docs — clears any prior
 *    ecommerce object so events don't bleed into each other).
 * 2. Pushes the GA4-spec ecommerce event.
 * 3. Soft-fails if window.dataLayer is undefined (GTM blocked, SSR, etc.).
 *
 * GA4 spec reference:
 *   https://developers.google.com/tag-platform/gtagjs/reference/events
 */

export interface SeasonItem {
  /** Season UUID — used as the GA4 item_id */
  id: string;
  /** Display name, e.g. "Summer Soccer - Worthington 2026" */
  name: string;
  /** Sport name, e.g. "Soccer" */
  category: string;
  /** Location name, e.g. "Worthington" */
  category2: string;
  /** Unit price (full season price, not the deposit/balance amount) */
  priceCents: number;
}

export type CheckoutPaymentType = "deposit" | "balance" | "full";

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
}

function getDataLayer(): Array<Record<string, unknown>> | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as DataLayerWindow;
  return w.dataLayer ?? null;
}

function pushEvent(event: string, ecommerce: Record<string, unknown>): void {
  const dl = getDataLayer();
  if (!dl) return;
  dl.push({ ecommerce: null });
  dl.push({ event, ecommerce });
}

function itemPayload(item: SeasonItem) {
  return {
    item_id: item.id,
    item_name: item.name,
    item_category: item.category,
    item_category2: item.category2,
    price: item.priceCents / 100,
    quantity: 1,
  };
}

export function trackViewItem(item: SeasonItem): void {
  pushEvent("view_item", {
    currency: "USD",
    value: item.priceCents / 100,
    items: [itemPayload(item)],
  });
}

export function trackBeginCheckout(
  item: SeasonItem,
  valueCents: number,
  coupon?: string,
): void {
  pushEvent("begin_checkout", {
    currency: "USD",
    value: valueCents / 100,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}

export function trackAddPaymentInfo(
  item: SeasonItem,
  valueCents: number,
  paymentType: string,
  coupon?: string,
): void {
  pushEvent("add_payment_info", {
    currency: "USD",
    value: valueCents / 100,
    payment_type: paymentType,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}

export function trackPurchase(
  transactionId: string,
  item: SeasonItem,
  valueCents: number,
  paymentType: CheckoutPaymentType,
  coupon?: string,
): void {
  pushEvent("purchase", {
    transaction_id: transactionId,
    currency: "USD",
    value: valueCents / 100,
    payment_type: paymentType,
    ...(coupon ? { coupon } : {}),
    items: [itemPayload(item)],
  });
}
