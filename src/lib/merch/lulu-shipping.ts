import {
  calculatePrintJobCost, isLuluConfigured, LuluApiError,
} from "@/lib/lulu/client";
import {
  LULU_SHIPPING_LEVELS, LULU_LEVEL_LABELS,
  type LuluShippingLevel, type LuluAddressInput, type LuluCostLineItem,
} from "@/lib/lulu/types";
import type { MerchShippingAddress } from "@/lib/db/schema";

export interface LuluShippingOption {
  level: LuluShippingLevel;
  label: string;
  amountCents: number;
}

export interface LuluQuoteLine {
  luluPodPackageId: string | null;
  luluPageCount: number | null;
  quantity: number;
  productName: string;
}

export type LuluOptionsResult =
  | { ok: true; options: LuluShippingOption[] }
  | { ok: false; status: number; error: string };

export function toLuluAddress(a: MerchShippingAddress): LuluAddressInput {
  return {
    name: a.name,
    street1: a.address1,
    street2: a.address2 ?? null,
    city: a.city,
    stateCode: a.state,
    postcode: a.zip,
    countryCode: a.country,
    phoneNumber: process.env.LULU_CONTACT_PHONE ?? null,
  };
}

function toCostLineItems(lines: LuluQuoteLine[]): { ok: true; items: LuluCostLineItem[] } | { ok: false; missing: string[] } {
  const missing = lines.filter((l) => !l.luluPodPackageId || !l.luluPageCount || l.luluPageCount <= 0).map((l) => l.productName);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    items: lines.map((l) => ({
      podPackageId: l.luluPodPackageId as string,
      pageCount: l.luluPageCount as number,
      quantity: l.quantity,
    })),
  };
}

/**
 * Server-authoritative live shipping options for a books-only cart: one Lulu
 * cost-calc call per level (a level Lulu rejects for this destination is
 * skipped, not fatal), sorted cheapest-first. Mirrors resolveSelfShippedRate's
 * posture: unconfigured provider fails closed (503) rather than charging $0.
 */
export async function resolveLuluShippingOptions(
  address: MerchShippingAddress,
  lines: LuluQuoteLine[],
): Promise<LuluOptionsResult> {
  if (!isLuluConfigured()) return { ok: false, status: 503, error: "Shipping unavailable" };

  const cost = toCostLineItems(lines);
  if (!cost.ok) {
    return { ok: false, status: 422, error: `Book printing isn't configured for: ${cost.missing.join(", ")}` };
  }

  const luluAddress = toLuluAddress(address);
  const options: LuluShippingOption[] = [];
  for (const level of LULU_SHIPPING_LEVELS) {
    try {
      const { shippingCents } = await calculatePrintJobCost({ lineItems: cost.items, address: luluAddress, level });
      // A non-positive shippingCents means Lulu's response was missing/malformed
      // shipping_cost data (a 200 with no real quote) — treat it the same as a
      // level Lulu rejects outright, never charge the buyer $0 shipping.
      if (shippingCents <= 0) continue;
      options.push({ level, label: LULU_LEVEL_LABELS[level], amountCents: shippingCents });
    } catch (e) {
      // Per-level failure = that level isn't offered for this destination.
      // A non-Lulu error is a real bug — rethrow it.
      if (!(e instanceof LuluApiError)) throw e;
    }
  }
  if (options.length === 0) return { ok: false, status: 422, error: "We can't ship to that address" };
  options.sort((a, b) => a.amountCents - b.amountCents);
  return { ok: true, options };
}

/** Named level from the options list, or the cheapest when level is absent.
 * Null when a named level isn't offered — callers 422, never silently
 * substitute (the buyer approved a specific price). */
export function pickLuluOption(options: LuluShippingOption[], level?: string | null): LuluShippingOption | null {
  if (!level) return options[0] ?? null;
  return options.find((o) => o.level === level) ?? null;
}
