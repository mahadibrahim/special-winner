import type { MerchShippingAddress } from "@/lib/db/schema";
import type { PrintfulRecipient, PrintfulShippingRate } from "./types";
import { retailPriceToCents } from "@/lib/merch/map-sync-product";

export function toPrintfulRecipient(addr: MerchShippingAddress): PrintfulRecipient {
  return {
    name: addr.name,
    address1: addr.address1,
    ...(addr.address2 ? { address2: addr.address2 } : {}),
    city: addr.city,
    state_code: addr.state,
    country_code: addr.country,
    zip: addr.zip,
  };
}

export function shippingRateToCents(rate: string): number {
  return retailPriceToCents(rate); // same decimal-string → cents contract
}

export function pickCheapestRate(
  rates: PrintfulShippingRate[],
): PrintfulShippingRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((cheapest, r) =>
    shippingRateToCents(r.rate) < shippingRateToCents(cheapest.rate) ? r : cheapest,
  );
}

export function buildPrintfulOrderItems(
  items: { printfulSyncVariantId: string; quantity: number }[],
): { sync_variant_id: number; quantity: number }[] {
  return items.map((i) => ({
    sync_variant_id: Number(i.printfulSyncVariantId),
    quantity: i.quantity,
  }));
}
