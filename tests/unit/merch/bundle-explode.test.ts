/**
 * Drives the REAL `explodeBundles` (not a re-derivation of its formula)
 * through the multi-unit indivisible-discount case, with its two DB
 * dependencies (`getBundleWithItems`/`getBundleByStoreAndId` from
 * `@/lib/merch/bundles`, `repriceStoreCartItems` from `@/lib/merch/reprice`)
 * stubbed via `vi.mock`.
 *
 * This closes the coverage gap flagged in code review: the
 * "slot.quantity>1 indivisible discount" case in bundle-checkout.test.ts
 * only re-derives the base/base+1/scale formula inline using the pure
 * helpers, and the API test only ever exercises slot.quantity === 1 — so
 * the actual indivisible-remainder branch inside `explodeBundles` itself
 * had zero executed coverage before this file.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { explodeBundles } from "@/lib/merch/bundle-checkout";
import { getBundleByStoreAndId, getBundleWithItems } from "@/lib/merch/bundles";
import { repriceStoreCartItems } from "@/lib/merch/reprice";
import { bundleFullCents, bundleDiscountedCents } from "@/lib/merch/bundle-pricing";
import type { MerchBundle, MerchVariant } from "@/lib/db/schema";

vi.mock("@/lib/merch/bundles", () => ({
  getBundleByStoreAndId: vi.fn(),
  getBundleWithItems: vi.fn(),
}));
vi.mock("@/lib/merch/reprice", () => ({
  repriceStoreCartItems: vi.fn(),
}));

const STORE_ID = "store-1";
const BUNDLE_ID = "bundle-1";
const BUNDLE_NAME = "Jersey + Socks Bundle";

// Chosen so the socks slot's per-bundle discounted share (929) is NOT evenly
// divisible by its slot.quantity (3) — see the node scratch calc: full=2998,
// 7% off -> discounted=2788, parts=[1859 (jersey, qty1), 929 (socks, qty3)],
// and 929 / 3 = 309 remainder 2 (indivisible).
const JERSEY_PRICE = 1999;
const SOCKS_PRICE = 333;
const SOCKS_SLOT_QTY = 3;
const DISCOUNT_VALUE = 7;

function makeVariant(id: string, overrides: Partial<MerchVariant> = {}): MerchVariant {
  return {
    id,
    productId: "product-x",
    printfulSyncVariantId: null,
    printfulVariantId: null,
    name: `Variant ${id}`,
    size: "OS",
    color: null,
    sku: null,
    retailPriceCents: 1000,
    weightOz: 10,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const jerseyVariant = makeVariant("variant-jersey", { productId: "product-jersey" });
const socksVariant = makeVariant("variant-socks", { productId: "product-socks" });
const offBundleVariant = makeVariant("variant-off-bundle", { productId: "product-unrelated" });

function makeBundle(overrides: Partial<MerchBundle> = {}): MerchBundle {
  return {
    id: BUNDLE_ID,
    organizationId: "org-1",
    storeId: STORE_ID,
    name: BUNDLE_NAME,
    slug: "jersey-socks-bundle",
    description: null,
    images: null,
    discountType: "percent",
    discountValue: DISCOUNT_VALUE,
    fulfillmentType: "self_shipped",
    active: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const bundleWithItems = {
  bundle: makeBundle(),
  items: [
    {
      slot: { id: "slot-jersey", bundleId: BUNDLE_ID, productId: "product-jersey", label: null, quantity: 1, sortOrder: 0 },
      product: { id: "product-jersey", name: "Test Jersey", slug: "test-jersey" },
      variants: [jerseyVariant],
    },
    {
      slot: { id: "slot-socks", bundleId: BUNDLE_ID, productId: "product-socks", label: null, quantity: SOCKS_SLOT_QTY, sortOrder: 1 },
      product: { id: "product-socks", name: "Test Socks", slug: "test-socks" },
      variants: [socksVariant],
    },
  ],
};

// Robust to whichever order explodeBundles passes chosen variants in (it
// preserves the caller's request order, same contract as the real
// repriceStoreCartItems) — looks each requested variantId up independently.
function mockReprice() {
  const priceByVariant: Record<string, { unitPriceCents: number; weightOz: number; productName: string; variantName: string }> = {
    "variant-jersey": { unitPriceCents: JERSEY_PRICE, weightOz: 16, productName: "Test Jersey", variantName: "Test Jersey / OS" },
    "variant-socks": { unitPriceCents: SOCKS_PRICE, weightOz: 4, productName: "Test Socks", variantName: "Test Socks / OS" },
  };
  (repriceStoreCartItems as unknown as Mock).mockImplementation(
    async (_storeId: string, items: { variantId: string; quantity: number }[]) => {
      const lines = [];
      for (const it of items) {
        const p = priceByVariant[it.variantId];
        if (!p) return { ok: false };
        lines.push({
          variantId: it.variantId,
          fulfillmentType: "self_shipped" as const,
          printfulVariantId: null,
          printfulSyncVariantId: null,
          productName: p.productName,
          variantName: p.variantName,
          size: "OS",
          color: null,
          unitPriceCents: p.unitPriceCents,
          personalizationConfig: null,
          quantity: it.quantity,
          weightOz: p.weightOz,
          lengthIn: null,
          widthIn: null,
          heightIn: null,
        });
      }
      return { ok: true, lines };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (getBundleByStoreAndId as unknown as Mock).mockResolvedValue(bundleWithItems.bundle);
  (getBundleWithItems as unknown as Mock).mockResolvedValue(bundleWithItems);
  mockReprice();
});

describe("explodeBundles — real function, multi-unit indivisible discount", () => {
  it("splits a slot.quantity=3 component's indivisible discounted share correctly, scaled by request.quantity=2", async () => {
    const requestQuantity = 2;
    const result = await explodeBundles(STORE_ID, [
      {
        bundleId: BUNDLE_ID,
        selections: [
          { slotId: "slot-jersey", variantId: "variant-jersey" },
          { slotId: "slot-socks", variantId: "variant-socks" },
        ],
        quantity: requestQuantity,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Independently recompute the expected discounted total the same way
    // bundle-pricing.ts does, so this assertion doesn't just restate the
    // implementation.
    const full = bundleFullCents([
      { unitPriceCents: JERSEY_PRICE, quantity: 1 },
      { unitPriceCents: SOCKS_PRICE, quantity: SOCKS_SLOT_QTY },
    ]);
    expect(full).toBe(2998);
    const discountedPerBundle = bundleDiscountedCents(full, "percent", DISCOUNT_VALUE);
    expect(discountedPerBundle).toBe(2788);

    // (a) every unit price is a non-negative integer
    expect(result.lines.every((l) => Number.isInteger(l.unitPriceCents) && l.unitPriceCents >= 0)).toBe(true);

    // (b) grand total across all exploded lines === discountedPerBundle * requestQuantity, EXACTLY
    const grandTotal = result.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    expect(grandTotal).toBe(discountedPerBundle * requestQuantity);

    // The indivisible-remainder branch actually fired for the socks slot:
    // parts[socks] = 929, 929 / 3 = 309 remainder 2 -> two distinct unit
    // prices among the socks lines (not a single uniform price).
    const socksLines = result.lines.filter((l) => l.variantId === "variant-socks");
    const distinctSocksPrices = new Set(socksLines.map((l) => l.unitPriceCents));
    expect(distinctSocksPrices.size).toBe(2);
    expect([...distinctSocksPrices].sort((a, b) => a - b)).toEqual([309, 310]);

    // (c) every line carries the right bundle attribution + fulfillment type
    expect(result.lines.every((l) => l.bundleId === BUNDLE_ID)).toBe(true);
    expect(result.lines.every((l) => l.bundleName === BUNDLE_NAME)).toBe(true);
    expect(result.lines.every((l) => l.fulfillmentType === "self_shipped")).toBe(true);

    // (d) physical unit counts: jersey 1*2=2, socks 3*2=6
    const jerseyLines = result.lines.filter((l) => l.variantId === "variant-jersey");
    expect(jerseyLines.reduce((s, l) => s + l.quantity, 0)).toBe(1 * requestQuantity);
    expect(socksLines.reduce((s, l) => s + l.quantity, 0)).toBe(SOCKS_SLOT_QTY * requestQuantity);
  });

  it("422s when a selection's variant isn't one of that slot's (mocked) allowed variants — off-bundle", async () => {
    const result = await explodeBundles(STORE_ID, [
      {
        bundleId: BUNDLE_ID,
        selections: [
          { slotId: "slot-jersey", variantId: offBundleVariant.id }, // not in slot-jersey's variants list
          { slotId: "slot-socks", variantId: "variant-socks" },
        ],
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ ok: false, status: 422, error: "Invalid selection" });
    // Validation must fail before ever hitting the (mocked) reprice call.
    expect(repriceStoreCartItems).not.toHaveBeenCalled();
  });

  it("422s when a slot has no selection at all", async () => {
    const result = await explodeBundles(STORE_ID, [
      {
        bundleId: BUNDLE_ID,
        selections: [{ slotId: "slot-jersey", variantId: "variant-jersey" }],
        quantity: 1,
      },
    ]);
    expect(result).toEqual({ ok: false, status: 422, error: "Select one option per item" });
  });

  it("404s when the mocked store-scoped bundle fetch finds nothing", async () => {
    (getBundleByStoreAndId as unknown as Mock).mockResolvedValue(null);
    const result = await explodeBundles(STORE_ID, [
      { bundleId: BUNDLE_ID, selections: [{ slotId: "slot-jersey", variantId: "variant-jersey" }], quantity: 1 },
    ]);
    expect(result).toEqual({ ok: false, status: 404, error: "Bundle not found" });
  });

  it("409s when a chosen component's fulfillmentType doesn't match the bundle's", async () => {
    (repriceStoreCartItems as unknown as Mock).mockResolvedValue({
      ok: true,
      lines: [
        {
          variantId: "variant-jersey",
          fulfillmentType: "printful_pod", // bundle is self_shipped
          printfulVariantId: null,
          printfulSyncVariantId: null,
          productName: "Test Jersey",
          variantName: "Test Jersey / OS",
          size: "OS",
          color: null,
          unitPriceCents: JERSEY_PRICE,
          personalizationConfig: null,
          quantity: 1,
          weightOz: 16,
          lengthIn: null,
          widthIn: null,
          heightIn: null,
        },
        {
          variantId: "variant-socks",
          fulfillmentType: "self_shipped",
          printfulVariantId: null,
          printfulSyncVariantId: null,
          productName: "Test Socks",
          variantName: "Test Socks / OS",
          size: "OS",
          color: null,
          unitPriceCents: SOCKS_PRICE,
          personalizationConfig: null,
          quantity: SOCKS_SLOT_QTY,
          weightOz: 4,
          lengthIn: null,
          widthIn: null,
          heightIn: null,
        },
      ],
    });
    const result = await explodeBundles(STORE_ID, [
      {
        bundleId: BUNDLE_ID,
        selections: [
          { slotId: "slot-jersey", variantId: "variant-jersey" },
          { slotId: "slot-socks", variantId: "variant-socks" },
        ],
        quantity: 1,
      },
    ]);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "This bundle's items changed — please refresh and try again",
    });
  });
});
