# Merch Phase 3d — Bundles / Packages

**Date:** 2026-07-26
**Branch:** `feat/merch-phase3d-bundles` (off `main`, which has Phases 3b + 3c)
**Status:** Design — awaiting review before implementation planning.

## Context

The merch platform now has: multi-store foundation (3b), and per-line fulfillment with live carrier rates (3c). Products have a store, a `fulfillment_type` (`printful_pod | self_shipped | pickup | digital`), variants with prices + weights, and personalization config. Checkout reprices server-side, partitions lines by fulfillment, computes shipping (Printful rates / Shippo rates / pickup=0), and creates a Stripe hosted Checkout session; a webhook dispatches fulfillment per type.

Phase 3d adds **bundles**: a purchasable package of component products (e.g. a "Team Starter Kit" = jersey + shorts + socks) sold at a discount, where the buyer picks a variant (size) per component.

## Owner-approved decisions

1. **Pricing: sum of chosen components minus a bundle discount.** The bundle price = Σ(chosen component variant prices) − an owner-set discount (percent or fixed-cents). The savings is explicit and the total tracks the buyer's variant choices.
2. **Buyer picks a variant per component.** Each component slot exposes an allowed set of variants (the component product's active variants); the buyer selects one per slot.
3. **Explode into component lines at checkout.** A bundle expands into its component variant lines — each routing to its own fulfillment type and contributing its weight — and shipping is computed over all physical items via 3c's parcel model. The bundle discount is distributed across the component lines. The bundle stays one priced unit for the buyer.
4. **Single fulfillment type per bundle (constraint).** All of a bundle's component products must share one `fulfillment_type` (validated at bundle creation + re-checked at checkout). This keeps a bundle's exploded lines uniform, sidestepping 3c's mixed-fulfillment-order gap. Cross-fulfillment bundles are a non-goal.

## Goal

Sell bundles end-to-end:
1. Admin creates a bundle in a store: name, a discount (percent or fixed), and a set of component products (all same fulfillment type); optional images.
2. A buyer opens the bundle page, picks a variant per component, sees the live price (Σ chosen − discount) and savings, and adds it to the cart.
3. Checkout reprices the chosen variants server-side, computes the discounted bundle price, explodes into component lines (discount distributed, cents exact), computes shipping over all items, and creates the Stripe session. The order records the components grouped under the bundle.
4. Fulfillment + admin work exactly as 3b/3c (each component line dispatches by its fulfillment type; the store admin sees the bundle-grouped order).

Non-goals (deferred): cross-fulfillment bundles; personalization **within** a bundle component (a bundle uses base variants — name/number on a kit jersey is a 3d+ follow-up); true multi-parcel box-splitting (3c's single-box summed-weight model is reused); nested bundles; per-component quantity the buyer chooses (component quantities are owner-fixed); digital goods (3e).

## Data model

### New: `merch_bundles`
Store-scoped, parallel to `merch_products`:
```
merch_bundles
  id, organization_id -> organizations (cascade), store_id -> merch_stores (cascade)
  name, slug (unique per store), description, images jsonb
  discount_type  enum merch_bundle_discount_type [percent | fixed]
  discount_value integer   -- percent: 0..100 ; fixed: cents (>= 0)
  fulfillment_type merch_fulfillment_type   -- derived/validated: all components share this
  active boolean, sort_order integer, created_at, updated_at
  unique (store_id, slug)
```
`fulfillment_type` is stored on the bundle (set = the shared type of its components) so the storefront/checkout can gate + route without re-deriving. `merch_bundle_discount_type` is a new pgEnum (its own migration concern only if a value is added later; created fresh here).

### New: `merch_bundle_items` (component slots)
```
merch_bundle_items
  id, bundle_id -> merch_bundles (cascade)
  product_id -> merch_products (restrict)   -- the component; allowed variants = its active variants
  label varchar    -- defaults to the product name; e.g. "Jersey"
  quantity integer not null default 1   -- owner-fixed count of this component in the bundle
  sort_order integer
  index (bundle_id)
```
Allowed variants for a slot = `merchVariants` of `product_id` that are active. `restrict` on product delete: a product in a bundle can't be hard-deleted (deactivate instead) — surfaced in admin like the store delete-with-orders rule.

### Changed: `merch_order_items`
Add nullable **`bundle_id`** (uuid, no FK / soft ref — the bundle may later be deleted; keep the snapshot) + **`bundle_name`** varchar snapshot. Exploded component lines carry these so admin/emails group them under "Team Starter Kit". Regular product lines leave them null.

No other enum changes (`fulfillment_type` reused; order status unchanged).

## Pricing & the explode/distribute algorithm (the heart of 3d)

Pure, unit-tested, server-authoritative (`src/lib/merch/bundle-pricing.ts`):

```ts
// component: { variantId, unitPriceCents, quantity } — quantity = slot.quantity × bundleLineQuantity
export function bundleFullCents(components: {unitPriceCents:number; quantity:number}[]): number
  // Σ unitPriceCents × quantity

export function bundleDiscountedCents(full: number, discountType: "percent"|"fixed", value: number): number
  // percent: round(full * (100 - clamp(value,0,100)) / 100) ; fixed: max(0, full - value)

// Distribute the discounted total back onto per-component EXTENDED line amounts so the
// integer cents sum EXACTLY to `discounted` (largest-remainder rounding). Returns each
// component's distributed extended amount; unit price = distributed / quantity is NOT
// re-derived (we persist an extended, quantity-1 order line per component to avoid a
// non-integer unit price — see checkout).
export function distributeBundleDiscount(
  components: {unitPriceCents:number; quantity:number}[],
  discounted: number,
): { extendedCents: number }[]   // same order; Σ extendedCents === discounted
```

- **Rounding:** proportional shares `extended_i = floor(full_i * discounted / full)`; the leftover cents (`discounted − Σ floor`) are handed one-at-a-time to the components with the largest fractional remainders. Guarantees Σ == discounted, no penny lost or created.
- **Zero-price guard:** if `full == 0` (all components free), distribute evenly / all-zero.
- The bundle discount NEVER makes a component negative (fixed discount clamps the total at 0; distribution only reduces).

## Storefront + cart

- **Store grid** (`/shop`, `/shop/[slug]`) lists bundles alongside products (a small "Bundle" badge + "from" price = the min-configuration discounted price, or just the discount framing). Bundles link to a distinct route to avoid product/bundle slug collision.
- **Bundle page** `src/pages/shop/[store]/bundle/[slug].astro` → a `BundleDetail` React island: renders each slot with a variant `<select>` (sizes), a live computed price (client mirror of `bundleFull/Discounted`, server re-checks at checkout), the savings, and add-to-cart. Unlisted-store token gate + noindex carried from 3b. Window/`isStoreShoppable` gating carried.
- **Cart** (`cart.ts`): a bundle line is a new `CartBundleItem { kind:"bundle"; bundleId; bundleSlug; storeId; storeSlug; fulfillmentType; name; selections: {slotId; productId; variantId; size}[]; quantity; lineId }`. `CartItem` becomes a union (product line | bundle line) OR bundle lines get a parallel array — **choose: extend the cart to hold both** (a discriminated `kind`). Bundle lines never merge (distinct `lineId`). `cart-store.ts` single-store rule still applies (a bundle carries `storeId`).

## Checkout

Extend `/api/merch/quote` + `/api/merch/checkout` to accept bundle lines alongside product lines:
- Request gains `bundles: [{ bundleId, selections:[{slotId, variantId}], quantity }]` (product `items` unchanged).
- New `src/lib/merch/bundle-checkout.ts` `explodeBundles(storeId, bundleRequests): Promise<{ok:true; lines: RepricedLine[]} | {ok:false; status; error}>`:
  1. Load each bundle (store-scoped, active, shoppable); 404/422 otherwise.
  2. For each, load its `bundle_items` (slots); validate the request supplies exactly one selection per slot, and each selected `variantId` is an active variant **of that slot's `product_id`** (else 422 — prevents picking an off-bundle variant).
  3. Reprice the chosen variants (authoritative prices/weights/fulfillment via the store-scoped variant query); validate **all chosen components share the bundle's `fulfillment_type`** (else 409 — a component's type drifted since creation).
  4. Compute `full` → `discounted` → `distributeBundleDiscount`; emit one `RepricedLine` **per component per unit** (quantity 1, `unitPriceCents` = distributed extended for that component÷its quantity is avoided by emitting quantity-1 lines with the exact distributed cents) carrying `fulfillmentType`, `weightOz`/dims, `bundleId`, `bundleName`, product/variant snapshot.
- `checkout.ts`/`quote.ts` concatenate exploded bundle lines with regular product lines, then the existing pipeline runs unchanged: `partitionByFulfillment`, shipping (Printful/Shippo/pickup over all lines' weights), Stripe line items (each exploded line is a Stripe line at its distributed price → tax correct, sums to bundle discounted total + other items), and `merch_order_items` insert (with `bundle_id`/`bundle_name`).
- **Money authoritative:** the client-shown bundle price is advisory; the server recomputes discounted price + distribution from DB prices. A stale/edited client price never applies.

## Fulfillment + admin

- **Fulfillment:** unchanged — exploded lines are ordinary order items with a `fulfillment_type`; a single-fulfillment bundle yields uniform lines that dispatch via the existing webhook (Printful submit / self_shipped stays-paid / pickup awaiting_pickup). `bundle_id`/`bundle_name` are display-only.
- **Admin bundle CRUD** — `/api/admin/merch/bundles` (+ `/admin/merch/stores/[id]` gains a Bundles section, or a bundle editor): create/edit a bundle (name, discount type+value, component products, images, active); validate ≥1 component and all components share one `fulfillment_type` (422 otherwise). `merch-store-editor.tsx` (or a new `merch-bundle-editor.tsx`) picks component products from the store's manual/printful products. Delete blocked if the bundle is referenced by orders? No — order items snapshot `bundle_name`, so a bundle can be deleted freely (soft ref). But a **product** in a bundle can't be hard-deleted (FK restrict) — deactivate instead.
- **Order view / CSV:** exploded lines group under `bundle_name` in the store order view; CSV shows the bundle name per line.

## Migration

`migration 0113_merch_bundles` (idempotent, generated off the current tip):
- `CREATE TYPE merch_bundle_discount_type` (guarded).
- `CREATE TABLE merch_bundles`, `merch_bundle_items` (guarded / `IF NOT EXISTS`).
- `ALTER TABLE merch_order_items ADD COLUMN IF NOT EXISTS bundle_id uuid`, `bundle_name varchar(255)`.
- Apply + verify on staging; `db:generate` no drift. (Watch the concurrent-migration-number hazard — renumber if `main` lands another migration first, per the 3b lesson.)

## Testing

- **Unit:** `bundleFullCents`, `bundleDiscountedCents` (percent + fixed + clamps), `distributeBundleDiscount` (sum-exactly, largest-remainder, zero-price, single-component); bundle-fulfillment-uniformity validation; slot/variant-membership validation.
- **API:** admin bundle CRUD (create with components, single-fulfillment 422, delete-with-product-in-bundle behavior, tenant isolation); a bundle checkout test — create a self_shipped bundle, quote/checkout it, assert the exploded lines' distributed prices sum to the discounted total, `bundle_id`/`bundle_name` persisted, shipping over all items (503 without Shippo key — gate), and picking an off-bundle variant → 422.
- **Live smoke (staging):** admin bundle → storefront bundle page → pick variants → cart → pickup checkout (Stripe session) → order shows grouped bundle lines summing to the discounted total.
- Grep `tests/e2e/` for `/shop` specs before merge.

## Slice plan (for the implementation plan)

1. **Schema + pricing** — `merch_bundles`/`merch_bundle_items` + `merch_order_items` bundle columns + migration 0113; pure `bundle-pricing.ts` (full/discounted/distribute) + unit tests.
2. **Bundle resolution + checkout** — `bundle-checkout.ts` `explodeBundles` (slot/variant validation, fulfillment-uniformity, reprice, distribute → RepricedLine[]); wire into `/quote` + `/checkout` (concat with product lines); persist `bundle_id`/`bundle_name` + API test.
3. **Storefront + cart** — bundle listing in the store grid, `bundle/[slug]` page + `BundleDetail` island (per-slot variant select + live price), cart bundle lines + drawer; E2E.
4. **Admin** — bundle CRUD endpoint + editor UI (component picker, discount, single-fulfillment validation) + order view/CSV grouping + API test.

## Risks

- **Discount-distribution rounding** — the one place cents can leak. Largest-remainder + a unit test asserting Σ == discounted across many random inputs closes it.
- **Off-bundle variant selection** — a crafted request could try to buy a cheaper variant not in the slot's product. Checkout validates each selected variant belongs to its slot's `product_id` + is active. 422 otherwise.
- **Fulfillment drift** — a component product's `fulfillment_type` changed after bundle creation → checkout re-validates uniformity (409) rather than emitting a mixed order.
- **Slug collision** product vs bundle in a store → distinct `/bundle/` route namespace; bundle slug unique per store.
- **Concurrent migration number** — renumber 0113 if another migration merges first (3b lesson).
- **Money authority** — server recomputes discounted price + distribution from DB; client price advisory only.
