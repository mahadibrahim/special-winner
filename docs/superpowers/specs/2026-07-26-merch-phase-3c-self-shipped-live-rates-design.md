# Merch Phase 3c — Self-Shipped Products + Live Carrier Rates

**Date:** 2026-07-26
**Branch:** `feat/merch-phase3c-selfshipped` (off `main` @ `0f7e6cb8`, which has Phase 3b)
**Status:** Design — awaiting review before implementation planning.

## Context

Phase 3b shipped the multi-store foundation: `merch_stores`, store-scoped catalog/cart, pickup checkout (address-skip, Ohio-origin tax), and a fulfillment dispatcher keyed on a **product-level `fulfillment_type`** enum (`printful_pod | self_shipped | pickup | digital`). Two of those are built (`printful_pod`, `pickup`); `self_shipped` and `digital` are seamed but unbuilt:

- `merch_products.fulfillment_type` already carries `self_shipped`.
- `reprice.ts` / `cart.ts` type unions include it; `checkout-store.ts` `lineNeedsShipping()` already treats `self_shipped` as shipping-required.
- `fulfillment.ts` `assertSupportedFulfillment()` throws on it (guard), and `orderFulfillmentPlan()` returns only `pickup | printful`.
- `checkout-store.ts` `partitionByFulfillment()` currently buckets only `printful` + `pickup` (whole-branch-review Minor: `self_shipped` excluded → an empty-parcel shipping call).

Phase 3c fills in `self_shipped`: products the org ships itself, priced at checkout with **live carrier rates** and fulfilled by the org marking the order shipped with a tracking number.

## Owner-approved decisions

1. **Rate provider: Shippo.** Live USPS/UPS/FedEx rates from one key. Wrapped behind a **provider interface** so EasyPost can slot in later without touching callers.
2. **Fulfillment model: admin marks shipped + tracking.** No in-app label purchase (deferred). Live rates price the order at checkout; the org packs it and enters a tracking number → order → `shipped` + tracking email.
3. **Checkout rate: cheapest, automatic.** Charge the single cheapest live rate for the parcel — same model the Printful path uses (`pickCheapestRate`). No buyer service-level picker.

## Goal

Sell self-shipped products end-to-end:
1. Admin creates a self-shipped product (manual, per-variant **weight**) in a store.
2. A buyer at checkout gets a **live cheapest carrier rate** (Shippo) computed from the org's ship-from address, the buyer's ship-to address, and the parcel weight; pays goods + shipping + Stripe Tax.
3. The order lands `paid`; admin sees it, packs it, and **marks it shipped with a tracking number** → order `shipped`, buyer gets a tracking email.

Non-goals (deferred): in-app label/postage purchase; buyer service-level selection; multi-parcel / bundle shipping (3d); digital goods (3e); EasyPost implementation (interface only); international customs. Printful and pickup paths are unchanged.

## Data model

### `merch_variants` — add shipping dimensions (self-shipped only)
- `weight_oz` **integer, nullable** — parcel weight in ounces. Required for `self_shipped` products (validated in admin + at checkout); null for printful/pickup/digital.
- `length_in`, `width_in`, `height_in` **integer, nullable** — optional parcel dimensions. When present, passed to Shippo for dimensional-weight accuracy; when absent, a store/org default box is used.

Weight lives on the **variant** (an XL jersey outweighs an S). `merch_products.fulfillment_type = 'self_shipped'` is the discriminator.

### `merch_orders` — capture the chosen rate + tracking
- `shipping_carrier` varchar, nullable — snapshot of the rate's carrier (e.g. `USPS`).
- `shipping_service` varchar, nullable — snapshot of the service level (e.g. `Ground Advantage`).
- `tracking_number` varchar, nullable — set when admin marks shipped.
- `tracking_url` varchar, nullable — carrier tracking URL (from Shippo, or derived).
- `shipped_at` timestamp, nullable.

(`shipping_cents`, `shipping_address`, `status` already exist. `merch_order_status` already has `shipped`.)

### No new enum values
`fulfillment_type` and `merch_order_status` already carry everything needed (`self_shipped`, `shipped`). **No migration enum-add** — 3c is columns-only + a provider integration.

## Shipping-rate provider (the swappable seam)

New `src/lib/shipping/` module — provider-agnostic, Printful-independent:

```ts
// src/lib/shipping/types.ts
export interface ShipAddress { name?: string; street1: string; street2?: string|null; city: string; state: string; zip: string; country: string }
export interface Parcel { weightOz: number; lengthIn?: number|null; widthIn?: number|null; heightIn?: number|null }
export interface ShippingRate { carrier: string; service: string; amountCents: number; estDays?: number|null; providerRateId?: string|null }
export interface ShippingRateProvider {
  isConfigured(): boolean;
  getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel): Promise<ShippingRate[]>;
}
```

- `src/lib/shipping/shippo.ts` — `ShippoRateProvider` implementing the interface via Shippo's `/shipments` rate API (`SHIPPO_API_KEY`). Maps Shippo rates → `ShippingRate[]` (amount → cents).
- `src/lib/shipping/index.ts` — `getShippingProvider()` returns the configured provider (Shippo today; a `SHIPPING_PROVIDER` env could switch later). `pickCheapestRate(rates)` (pure, mirrors the Printful mapper) + a pure `parcelForLines(lines)` that sums variant weights into one parcel (single-box model for 3c; multi-parcel is 3d).
- Errors: a `ShippingProviderError` (like `PrintfulApiError`) so checkout can 502 on provider failure and 422 on "no rates to that address".

Ship-from = the org's origin address via the existing `getOrgOriginAddress(orgId)` (Phase 3b, reads the org's primary `locations` row).

## Reprice & checkout

### `reprice.ts` — carry weight/dims
`RepricedLine` / `VariantPriceRow` gain `weightOz`, `lengthIn`, `widthIn`, `heightIn` (nullable) selected from `merch_variants`. Everything else unchanged (already store-scoped, no source filter).

### `checkout-store.ts` — include self_shipped in the shipping partition
- Fix `partitionByFulfillment` to bucket **`self_shipped`** alongside `printful` (both need shipping) — resolving the 3b Minor. Shape: `{ printful, selfShipped, pickup }`.
- `lineNeedsShipping` already correct (printful + self_shipped).

### `/api/merch/quote` + `/api/merch/checkout` — a self-shipped shipping branch
Both endpoints already resolve the store, reprice, gate `isStoreShoppable`, and validate personalization. Extend the shipping computation:
- **Pure printful store** → existing Printful `calculateShipping` path (unchanged).
- **Self-shipped lines present** → require the ship-to address; build the parcel via `parcelForLines(selfShipped)` (validate every self_shipped variant has `weightOz`, else 422 "shipping not configured for <product>"); call `getShippingProvider().getRates(orgOrigin, buyerAddress, parcel)`; `pickCheapestRate`; `shippingCents = rate.amountCents`. Persist `shipping_carrier`/`shipping_service` on the order at checkout.
- **Mixed printful + self_shipped in one store/cart** → out of scope for 3c (a store is effectively single-fulfillment in practice). If encountered, sum the two shipping quotes; note the simplification in code. Pickup lines add zero shipping as today.
- Tax: `automatic_tax` stays on; shipping is taxed per Stripe's handling of the shipping line (unchanged from the Printful path). Ship-to present → Stripe uses the buyer's address (destination tax), consistent with the Printful path.
- `buildMerchLineItems` + the Stripe `shipping_options` fixed-amount rate are reused as-is.

## Fulfillment (webhook) + admin ship

### `fulfillment.ts` — dispatch self_shipped to admin-manual
- `orderFulfillmentPlan(items)` gains **`self_shipped`**: returns `"self_shipped"` when every item is `self_shipped` (else the existing pickup/printful logic; a mixed order with any printful line still goes `printful`).
- `assertSupportedFulfillment` allows `self_shipped`.
- `handleMerchOrderCompleted` dispatch: `self_shipped` → **no external fulfillment call** — leave the order `paid` (awaiting the org to ship) and send a "we've got your order, we'll email tracking when it ships" confirmation (`sendMerchOrderConfirmation`, which already says exactly that — reuse it; the tracking email is sent later at mark-shipped). Return `{ status: "processed-self-shipped" }`. Money-safe + idempotent exactly like the other branches (mark-paid, then dispatch; re-fired webhook no-ops via the `status !== 'pending'` guard).

### Admin — mark shipped + tracking
Extend the Phase-3b order-management endpoint/UI (`/api/admin/merch/orders`, `merch-store-orders.tsx`), which already does pickup **mark-collected**:
- `PATCH /api/admin/merch/orders` gains a `{ orderId, status: "shipped", trackingNumber, trackingUrl?, carrier?, service? }` transition — valid only from `paid` (a self-shipped order), org-scoped via `getStoreById`, sets `tracking_number`/`tracking_url`/`shipped_at` + status `shipped`, then sends the **tracking email** (`sendMerchShippedEmail(orderId)` — new, or extend the confirmation email module: shows the tracking number + URL).
- Admin UI: for a `paid` self-shipped order, a "Mark shipped" action that collects a tracking number (+ optional carrier/service, prefilled from the order's snapshot). CSV export includes the shipping address + tracking columns.

## Admin — self-shipped products

Extend the Phase-3b manual-product editor (`store-products.ts` + `merch-store-editor.tsx`, currently hardcoded `fulfillment_type='pickup'`):
- Product creation gains a **fulfillment choice** for manual products: `pickup` (existing) or `self_shipped`.
- When `self_shipped`, the per-size variant rows require **`weight_oz`** (and optional L/W/H). The endpoint validates weight presence for self_shipped; stores it on `merch_variants`.
- The `source='manual'` guard from 3b stays (Printful products remain sync-managed and untouched).

## Migration

Single migration `0112_merch_self_shipped` (columns-only, idempotent, generated off `0111`):
- `merch_variants`: `ADD COLUMN IF NOT EXISTS weight_oz integer`, `length_in`, `width_in`, `height_in`.
- `merch_orders`: `ADD COLUMN IF NOT EXISTS shipping_carrier`, `shipping_service`, `tracking_number`, `tracking_url`, `shipped_at`.
- No enum changes. `db:generate` off `0111` produces the DDL; hand-add `IF NOT EXISTS` guards per repo convention. Apply + verify on staging.

## Env / owner action

- **`SHIPPO_API_KEY`** in prod Netlify (and bws for local/staging) — like `PRINTFUL_API_KEY`. Without it, `getShippingProvider().isConfigured()` is false → self-shipped quote/checkout return **503 "Shipping unavailable"** (graceful; printful/pickup unaffected).
- The org's primary `locations` row must have a real ship-from address (already used for pickup Ohio-origin tax).

## Testing

- **Unit:** `pickCheapestRate` (min selection, empty → null); `parcelForLines` (weight summation, missing-weight → error); Shippo rate → `ShippingRate` mapper; `partitionByFulfillment` now includes self_shipped; `orderFulfillmentPlan` self_shipped case; the mark-shipped transition guard (only `paid → shipped`).
- **API:** a self-shipped checkout test — create a self_shipped store+product (with weight) via admin, then quote (live Shippo rate > 0, or 503 when unconfigured on CI) + checkout (Stripe session), and the admin `mark-shipped` transition (paid→shipped, tracking persisted, illegal transition rejected). Gate provider-dependent assertions like the Stripe ones (`[200, 503]`).
- **Live smoke (staging, real Shippo test key):** admin self-shipped product w/ weight → storefront → live rate at quote → checkout → Stripe session → webhook leaves order `paid` → admin mark-shipped w/ tracking → order `shipped` + tracking email.

## Slice plan (for the implementation plan)

1. **Schema + migration** (`weight_oz`/dims on variants; carrier/tracking on orders; migration 0112) + shipping-provider module (`shipping/types.ts`, `shippo.ts`, `index.ts`, `pickCheapestRate`, `parcelForLines`) + unit tests.
2. **Reprice + checkout** (carry weight; `partitionByFulfillment` self_shipped; the self-shipped shipping branch in `/quote` + `/checkout`; persist carrier/service) + unit tests.
3. **Fulfillment + tracking email** (`orderFulfillmentPlan` self_shipped; webhook self-shipped branch; `sendMerchShippedEmail`) + unit tests.
4. **Admin** (self_shipped product creation with weight in the editor; `mark-shipped` transition endpoint + UI; CSV tracking columns) + API tests.

## Risks

- **No ship-from address** → Shippo returns no rates / errors. Validate the org origin at checkout; 422 with a clear message; ship-from defaults to the Ohio fallback already used for pickup tax.
- **Weight missing on a self_shipped variant** → 422 at checkout (and admin requires it at creation) — never a silent zero-weight parcel.
- **Provider outage** → 502 (retryable), money not taken. `isConfigured()` false → 503 up front.
- **Mixed-fulfillment store** → summed shipping; single-fulfillment stores are the norm — documented simplification.
- **Rate drift between quote and checkout** → checkout re-quotes server-side (never trusts the client rate), same as Printful.
