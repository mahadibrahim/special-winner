/**
 * Bundle → order-line explosion for the merch quote/checkout endpoints
 * (merch Phase 3d). Server-authoritative: never trust a client-sent price
 * for a bundle — every cent here is recomputed from the store's live
 * variant prices and the bundle's discount rule.
 *
 * Emission scheme (why it's cents-exact):
 *
 * For one bundle request of `quantity` units, `distributeBundleDiscount`
 * (bundle-pricing.ts) gives each slot i an exact `parts[i]` — the discounted
 * cents owed for THAT SLOT across a single bundle unit (i.e. across
 * `slot.quantity` physical items). Every bundle unit purchased in this
 * request is identical, so instead of repeating a per-unit split
 * `quantity` times, we split `parts[i]` once across `slot.quantity` and then
 * scale the resulting group sizes by `quantity`:
 *
 *   base      = floor(parts[i] / slot.quantity)
 *   remainder = parts[i] - base * slot.quantity   (0 <= remainder < slot.quantity)
 *
 *   -> `remainder * quantity` physical units at `base + 1` cents
 *   -> `(slot.quantity - remainder) * quantity` physical units at `base` cents
 *
 * Sum for slot i across the whole request:
 *   remainder*(base+1) + (slot.quantity-remainder)*base
 *     = base*slot.quantity + remainder = parts[i]
 *   ... times `quantity` bundle copies = parts[i] * quantity.
 *
 * Summing over all slots: Σ(parts[i] * quantity) = quantity * Σparts[i]
 *   = quantity * discountedPerBundle (distributeBundleDiscount's own
 *   exactness guarantee) — so the emitted lines' Σ(unitPriceCents × quantity)
 *   equals `discountedPerBundle * quantity` exactly, for every slot and
 *   every request. Every unitPriceCents is an integer by construction
 *   (base and base+1 are both integers), and both split groups are physical
 *   units of the same chosen variant, so item counts are preserved
 *   (remainder*quantity + (slot.quantity-remainder)*quantity = slot.quantity*quantity).
 */
import { getBundleByStoreAndId, getBundleWithItems, type BundleSlot } from "@/lib/merch/bundles";
import { repriceStoreCartItems, type RepricedLine } from "@/lib/merch/reprice";
import {
  bundleFullCents,
  bundleDiscountedCents,
  distributeBundleDiscount,
  type BundleComponent,
} from "@/lib/merch/bundle-pricing";

export interface BundleSelectionRequest {
  bundleId: string;
  selections: { slotId: string; variantId: string }[];
  quantity: number;
}

export type ExplodeBundlesResult =
  | { ok: true; lines: RepricedLine[] }
  | { ok: false; status: number; error: string };

export interface ValidatedSelection {
  slot: BundleSlot["slot"];
  variantId: string;
}

export type ValidateSelectionsResult =
  | { ok: true; chosen: ValidatedSelection[] }
  | { ok: false; reason: "missing" | "off-bundle" };

/**
 * Pure: require exactly one selection per slot (no missing, no duplicate, no
 * unknown slotId), and that each chosen variantId is one of that slot's
 * (already-active-filtered) product variants — never an off-bundle or
 * inactive variant. Returns `chosen` in slot order.
 */
export function validateSelections(
  slots: BundleSlot[],
  selections: { slotId: string; variantId: string }[],
): ValidateSelectionsResult {
  if (selections.length !== slots.length) return { ok: false, reason: "missing" };

  const bySlotId = new Map(slots.map((s) => [s.slot.id, s]));
  const seen = new Set<string>();
  const chosen: ValidatedSelection[] = [];

  for (const sel of selections) {
    if (seen.has(sel.slotId)) return { ok: false, reason: "missing" };
    seen.add(sel.slotId);

    const slot = bySlotId.get(sel.slotId);
    if (!slot) return { ok: false, reason: "missing" };

    const variantOk = slot.variants.some((v) => v.id === sel.variantId);
    if (!variantOk) return { ok: false, reason: "off-bundle" };

    chosen.push({ slot: slot.slot, variantId: sel.variantId });
  }

  if (seen.size !== slots.length) return { ok: false, reason: "missing" };
  return { ok: true, chosen };
}

/**
 * Pure: split `totalCents` into 1-2 groups of {unitPriceCents, quantity}
 * across `count` physical units such that every unitPriceCents is an
 * integer and Σ(unitPriceCents × quantity) === totalCents exactly.
 */
export function splitEvenExact(
  totalCents: number,
  count: number,
): { unitPriceCents: number; quantity: number }[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count; // 0 <= remainder < count
  const groups: { unitPriceCents: number; quantity: number }[] = [];
  if (remainder > 0) groups.push({ unitPriceCents: base + 1, quantity: remainder });
  if (count - remainder > 0) groups.push({ unitPriceCents: base, quantity: count - remainder });
  return groups;
}

/**
 * Explode a list of bundle selection requests into server-priced order
 * lines. Fails closed on any mismatch between what the client selected and
 * what the store's live catalog says is buyable.
 */
export async function explodeBundles(
  storeId: string,
  requests: BundleSelectionRequest[],
): Promise<ExplodeBundlesResult> {
  const lines: RepricedLine[] = [];

  for (const request of requests) {
    const bundle = await getBundleByStoreAndId(storeId, request.bundleId);
    if (!bundle) return { ok: false, status: 404, error: "Bundle not found" };
    if (!bundle.active) {
      return { ok: false, status: 422, error: "This bundle is no longer available" };
    }

    const withItems = await getBundleWithItems(bundle.id);
    if (!withItems || withItems.items.length === 0) {
      return { ok: false, status: 422, error: "This bundle is no longer available" };
    }

    const validated = validateSelections(withItems.items, request.selections);
    if (!validated.ok) {
      return validated.reason === "missing"
        ? { ok: false, status: 422, error: "Select one option per item" }
        : { ok: false, status: 422, error: "Invalid selection" };
    }

    const repriced = await repriceStoreCartItems(
      storeId,
      validated.chosen.map((c) => ({ variantId: c.variantId, quantity: c.slot.quantity })),
    );
    if (!repriced.ok) {
      return { ok: false, status: 422, error: "Some bundle items are unavailable" };
    }

    for (const line of repriced.lines) {
      if (line.fulfillmentType !== bundle.fulfillmentType) {
        return {
          ok: false,
          status: 409,
          error: "This bundle's items changed — please refresh and try again",
        };
      }
    }

    const components: BundleComponent[] = repriced.lines.map((l) => ({
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
    }));
    const full = bundleFullCents(components);
    const discountedPerBundle = bundleDiscountedCents(full, bundle.discountType, bundle.discountValue);
    const parts = distributeBundleDiscount(components, discountedPerBundle);

    repriced.lines.forEach((line, i) => {
      const slotQty = validated.chosen[i].slot.quantity;
      const groups = splitEvenExact(parts[i], slotQty);
      for (const g of groups) {
        lines.push({
          ...line,
          unitPriceCents: g.unitPriceCents,
          quantity: g.quantity * request.quantity,
          bundleId: bundle.id,
          bundleName: bundle.name,
        });
      }
    });
  }

  return { ok: true, lines };
}
