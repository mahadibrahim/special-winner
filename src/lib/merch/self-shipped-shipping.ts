import {
  getShippingProvider,
  pickCheapestRate,
  parcelForLines,
  ShippingProviderError,
  type ParcelLine,
} from "@/lib/shipping";
import { getOrgOriginAddress } from "@/lib/merch/org-origin";
import type { MerchShippingAddress } from "@/lib/db/schema";

export type SelfShippedRateResult =
  | { ok: true; shippingCents: number; carrier: string; service: string }
  | { ok: false; status: number; error: string };

/**
 * Resolve a live carrier rate for self-shipped (non-Printful) lines.
 *
 * Server-authoritative: the caller (quote/checkout) must not compute
 * shipping itself for these lines — always go through this helper so quote
 * and checkout can never disagree, and so a missing/misconfigured provider
 * fails closed (503) rather than silently charging $0 shipping.
 */
export async function resolveSelfShippedRate(
  orgId: string,
  address: MerchShippingAddress,
  lines: ParcelLine[],
): Promise<SelfShippedRateResult> {
  const provider = getShippingProvider();
  if (!provider.isConfigured()) return { ok: false, status: 503, error: "Shipping unavailable" };

  const parcel = parcelForLines(lines);
  if (!parcel.ok) {
    return {
      ok: false,
      status: 422,
      error: `Shipping isn't configured for: ${parcel.missing.join(", ")}`,
    };
  }

  const origin = await getOrgOriginAddress(orgId);
  const originStreet = origin.line1?.trim() ?? "";
  if (!originStreet || originStreet === "—") {
    return {
      ok: false,
      status: 422,
      error: "This store's shipping origin isn't set up yet. Contact the organizer.",
    };
  }

  const from = {
    street1: origin.line1,
    city: origin.city,
    state: origin.state,
    zip: origin.postal_code,
    country: origin.country,
  };
  const to = {
    name: address.name,
    street1: address.address1,
    street2: address.address2 ?? null,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
  };

  try {
    const rates = await provider.getRates(from, to, parcel.parcel);
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return { ok: false, status: 422, error: "We can't ship to that address" };
    return { ok: true, shippingCents: cheapest.amountCents, carrier: cheapest.carrier, service: cheapest.service };
  } catch (e) {
    if (e instanceof ShippingProviderError) return { ok: false, status: 502, error: "Shipping quote failed" };
    throw e;
  }
}
