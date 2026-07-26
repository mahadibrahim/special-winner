# Merch Phase 3d — Bundles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sell bundles — a store-scoped package of component products at a discount, where the buyer picks a variant per component; the bundle explodes into component lines at checkout (discount distributed, cents exact) reusing the 3b/3c store/fulfillment/shipping machinery.

**Architecture:** New `merch_bundles` + `merch_bundle_items` (store-scoped like products). A pure `bundle-pricing.ts` (full → discounted → largest-remainder distribution) and a `bundle-checkout.ts` `explodeBundles` that validates selections + fulfillment-uniformity, reprices, and emits `RepricedLine[]` (tagged `bundleId`/`bundleName`) that concatenate with product lines through the existing quote/checkout pipeline. Single fulfillment type per bundle. Stripe hosted Checkout + Stripe Tax / Astro SSR / Postgres unchanged.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle + Postgres, Stripe hosted Checkout, Vitest, Playwright.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-merch-phase-3d-bundles-design.md`. Every task implicitly includes it.
- **Owner decisions (fixed):** price = Σ chosen components − discount (percent|fixed); buyer picks a variant per slot; explode into component lines at checkout; **single fulfillment type per bundle** (validated at creation + re-checked at checkout).
- **Money server-authoritative:** the server recomputes the discounted price + per-component distribution from DB prices at quote AND checkout; the client bundle price is advisory. Every selected variant must be an active variant OF its slot's `product_id` (reject off-bundle variants).
- **Cents exact:** the distributed component amounts MUST sum exactly to the discounted bundle total (largest-remainder rounding); no penny created/lost.
- **Reuse 3b/3c:** store scoping, `isStoreShoppable`/window gating, unlisted `?k=` + noindex, `partitionByFulfillment`, Printful/Shippo/pickup shipping, the webhook dispatcher — bundle lines are ordinary `RepricedLine`s once exploded.
- **No cross-fulfillment bundles; no personalization within bundles; no true multi-parcel** (3c single-box summed weight); no nested bundles — all deferred.
- **Migration `0113`** (columns/tables). Renumber if `main` merges another migration first (the 3b concurrent-number lesson). Idempotent guards (`IF NOT EXISTS`, `DO $$ … duplicate_object`).
- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/merch-phase3d`, branch `feat/merch-phase3d-bundles`. No local `node_modules` — use `npx`. Dev/test DB = staging via bws. **Port 4321 may be held by another session** — controller runs the dev server on a free port and points tests at it (`PLAYWRIGHT_BASE_URL`/`TEST_BASE_URL`).
- Amounts integer cents; usd; goods tax code `txcd_99999999`. Commit after each task; end messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

**New:** `schema/merch-bundles.ts`; `lib/merch/bundle-pricing.ts` (pure); `lib/merch/bundles.ts` (resolvers); `lib/merch/bundle-checkout.ts` (`explodeBundles`); `pages/shop/[store]/bundle/[slug].astro`; `components/shop/bundle-detail.tsx`; `pages/api/admin/merch/bundles.ts`; `components/admin/merch-bundle-editor.tsx`; migration `0113_merch_bundles`.
**Modified:** `schema/merch-orders.ts` (order-item `bundle_id`/`bundle_name`); `schema/index.ts`; `lib/merch/reprice.ts` (`RepricedLine` gains optional `bundleId`/`bundleName`); `lib/merch/cart.ts` + `components/shop/cart-store.ts` + `cart-drawer.tsx` (bundle lines); `pages/api/merch/quote.ts` + `checkout.ts` (accept `bundles`, concat exploded lines, persist bundle fields); `pages/shop.astro` + `shop/[slug].astro` (list bundles); `components/admin/merch-store-orders.tsx` + `lib/merch/order-csv.ts` (group by bundle); `pages/admin/merch/stores/[id].astro` (Bundles section).

---

## Slice 1 — Schema + pricing

### Task 1.1: bundle schema + order-item bundle columns

**Files:** Create `src/lib/db/schema/merch-bundles.ts`; modify `src/lib/db/schema/merch-orders.ts` (order-item cols) + `schema/index.ts` + `reprice.ts` (`RepricedLine` optional bundle fields). Test `tests/unit/merch/bundle-schema.test.ts`.

**Interfaces produced:** `merchBundles` (id, organizationId, storeId, name, slug, description, images jsonb, `merchBundleDiscountTypeEnum` `[percent|fixed]`, discountValue int, `fulfillmentType` (merchFulfillmentTypeEnum), active, sortOrder; unique `(storeId, slug)`); `merchBundleItems` (id, bundleId→cascade, productId→restrict, label, quantity default 1, sortOrder; index bundleId); `merchOrderItems.bundleId` (uuid, nullable, no FK) + `bundleName` (varchar 255, nullable); `RepricedLine.bundleId?: string|null` + `bundleName?: string|null`.

- [ ] Step 1: failing test asserting `merchBundles`/`merchBundleItems` columns + `merchBundleDiscountTypeEnum.enumValues === ["percent","fixed"]` + `merchOrderItems` has `bundleId`/`bundleName`.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: write `merch-bundles.ts` (import `merchStores` from `./merch-stores`, `merchProducts` from `./merch`, `merchFulfillmentTypeEnum` from `./merch-orders`, `organizations`). Add `merchBundleItems` referencing `merchBundles` (cascade) + `merchProducts` (restrict). Export from `index.ts`.
- [ ] Step 4: `merch-orders.ts` — add `bundleId: uuid("bundle_id")` (no `.references`) + `bundleName: varchar("bundle_name",{length:255})` to `merchOrderItems`.
- [ ] Step 5: `reprice.ts` — add `bundleId?: string | null` + `bundleName?: string | null` to `RepricedLine` (optional; product lines omit them). Do NOT change `matchRequestedToRows` output for product lines.
- [ ] Step 6: run → PASS; `npx tsc --noEmit` 0. Commit `feat(merch): bundle schema + order-item bundle columns`.

### Task 1.2: migration 0113 (controller)

- [ ] `npx drizzle-kit generate --name merch_bundles` (columns/tables — a table+enum+column add; no rename prompt expected; if a prompt appears, drive with `expect`, answering "create"). Hand-edit the `.sql` to idempotent (`DO $$ … CREATE TYPE … duplicate_object`, `CREATE TABLE IF NOT EXISTS`, `ADD CONSTRAINT` in `DO $$ … duplicate_object OR duplicate_table`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Apply to staging; `db:generate` no drift. Commit `feat(merch): migration 0113 — bundles`.

### Task 1.3: pure bundle pricing

**Files:** Create `src/lib/merch/bundle-pricing.ts`. Test `tests/unit/merch/bundle-pricing.test.ts`.

**Interfaces produced:**
- `bundleFullCents(components: {unitPriceCents:number; quantity:number}[]): number`
- `bundleDiscountedCents(full:number, type:"percent"|"fixed", value:number): number`
- `distributeBundleDiscount(components: {unitPriceCents:number; quantity:number}[], discounted:number): number[]` — returns each component's **extended** (price×qty, discount-adjusted) cents, SAME order, `Σ === discounted` (largest-remainder). Zero-`full` → all-zero (or even split of `discounted`).

- [ ] Step 1: failing test:
```ts
import { describe, it, expect } from "vitest";
import { bundleFullCents, bundleDiscountedCents, distributeBundleDiscount } from "@/lib/merch/bundle-pricing";
const C = (p:number,q=1)=>({unitPriceCents:p,quantity:q});
describe("bundle pricing", () => {
  it("full = Σ price×qty", () => expect(bundleFullCents([C(4500),C(2500,2)])).toBe(9500));
  it("percent discount rounds", () => expect(bundleDiscountedCents(9500,"percent",10)).toBe(8550));
  it("fixed discount clamps at 0", () => expect(bundleDiscountedCents(3000,"fixed",5000)).toBe(0));
  it("distribution sums EXACTLY to discounted (many random)", () => {
    for (let t=0;t<500;t++){
      const comps=Array.from({length:1+Math.floor(1)}, ()=>C(1+Math.floor(1)*999, 1));
      const comps2=[C(4500),C(2500,2),C(1299,3)];
      const disc=bundleDiscountedCents(bundleFullCents(comps2),"percent",13);
      const parts=distributeBundleDiscount(comps2,disc);
      expect(parts.reduce((a,b)=>a+b,0)).toBe(disc);
    }
  });
  it("single component gets the whole discounted total", () => {
    const parts=distributeBundleDiscount([C(4500)], 4000); expect(parts).toEqual([4000]);
  });
  it("zero full -> zeros", () => expect(distributeBundleDiscount([C(0),C(0)],0)).toEqual([0,0]));
});
```
- [ ] Step 2: run → FAIL. Step 3: implement (floor proportional shares by extended = price×qty; hand leftover cents to largest fractional remainders; guard full==0). Step 4: run → PASS + tsc 0. Step 5: commit `feat(merch): pure bundle pricing + largest-remainder discount distribution`.

---

## Slice 2 — Bundle resolution + checkout

### Task 2.1: bundle resolvers

**Files:** Create `src/lib/merch/bundles.ts`. Test (pure parts only; DB fns via API test).

**Interfaces produced:** `getBundleBySlug(storeId, slug)`, `getBundleById(orgId, id)`, `listBundles(storeId)` (active, ordered), `getBundleWithItems(bundleId)` → `{ bundle, items:[{...slot, product, variants}] }` (slot + its product's active variants), `listStoreBundlesForGrid(storeId)`. Org/store-scoped, deterministic order.

- [ ] Implement mirroring `lib/merch/catalog.ts`/`stores.ts` patterns. Commit `feat(merch): bundle resolvers`.

### Task 2.2: explodeBundles + quote/checkout integration

**Files:** Create `src/lib/merch/bundle-checkout.ts`; modify `pages/api/merch/quote.ts` + `checkout.ts`. Test unit for `explodeBundles`' pure validation helpers + the controller-run API test.

**Interfaces produced:** `explodeBundles(storeId, requests: {bundleId; selections:[{slotId; variantId}]; quantity}[]): Promise<{ok:true; lines: RepricedLine[]} | {ok:false; status:number; error:string}>`:
1. Load each bundle (store-scoped, active); 404/422 if missing/closed.
2. Load its `bundle_items`; require exactly one selection per slot; each selected `variantId` must be an active variant of that slot's `product_id` (422 "invalid selection").
3. Reprice the chosen variants (store-scoped variant query, authoritative price/weight/fulfillment); validate every chosen component's `fulfillmentType === bundle.fulfillmentType` (409).
4. `full = bundleFullCents(components)`; `discounted = bundleDiscountedCents(...)`; `parts = distributeBundleDiscount(components, discounted × quantity?)` — compute per bundle-unit then × line quantity; emit **quantity-1 `RepricedLine`s** (one per component per unit) with `unitPriceCents` = that component-unit's distributed cents, `fulfillmentType`, weight/dims, `bundleId`, `bundleName`, product/variant snapshot. (Per-unit quantity-1 lines avoid non-integer unit prices.)

- [ ] Step 1: unit-test the pure validation (`validateSelections(slots, selections)` → ok/missing/off-bundle) + that exploded distributed cents sum to `discounted × quantity`.
- [ ] Step 2: implement `explodeBundles`.
- [ ] Step 3: `checkout.ts` + `quote.ts` — add `bundles: z.array(...).optional()` to the request schema; call `explodeBundles`; if `!ok` return its status/error; **concatenate** exploded lines with the existing product `priced` lines BEFORE `partitionByFulfillment`/shipping/Stripe. On the order-item insert, write `bundleId`/`bundleName` from each line (null for product lines). Everything downstream (shipping over all lines, Stripe line items, tax) is unchanged.
- [ ] Step 4: write the API test (create a self_shipped bundle + components via admin/DB, quote/checkout with a selection; assert exploded prices sum to discounted total, bundle_id/bundle_name persisted, off-bundle variant → 422, fulfillment gate; 503 for the Shippo-gated shipping step). Do NOT run (controller runs it).
- [ ] Step 5: tsc 0 + `astro build`. Commit `feat(merch): bundle explode + quote/checkout integration`.

---

## Slice 3 — Storefront + cart

### Task 3.1: cart bundle lines

**Files:** modify `src/lib/merch/cart.ts`, `components/shop/cart-store.ts`, `components/shop/cart-drawer.tsx`. Test `tests/unit/merch/cart.test.ts`.

**Interfaces produced:** `CartBundleItem { kind:"bundle"; lineId; bundleId; bundleSlug; storeId; storeSlug; fulfillmentType; name; imageUrl:string|null; unitPriceCents (discounted, display); selections:[{slotId; productId; variantId; label; size:string|null}]; quantity }`. `CartItem` gains `kind?: "product"` (default). A cart entry is `CartItem | CartBundleItem`. `cartStoreId` works across both. Bundle lines never merge. `cart-store.ts` `add` single-store rule applies (bundle carries `storeId`).

- [ ] TDD: `mergeCartItem` leaves bundle lines distinct; `cartStoreId` returns the store for a bundle-only cart; a bundle + product from the same store coexist; cross-store add replaces. Commit `feat(merch): cart holds bundle lines`.

### Task 3.2: bundle storefront page + grid listing

**Files:** Create `pages/shop/[store]/bundle/[slug].astro` + `components/shop/bundle-detail.tsx`; modify `pages/shop.astro` + `pages/shop/[slug].astro` (list bundles in the grid).

- [ ] `bundle/[slug].astro` — resolve store (unlisted `?k=` gate + noindex, window gating, all carried from 3b) + `getBundleWithItems`; 404 if missing. Render `BundleDetail`.
- [ ] `bundle-detail.tsx` — per-slot variant `<select>`; a live price via a client mirror of `bundleFull/DiscountedCents` (server re-checks at checkout); shows savings; add-to-cart builds a `CartBundleItem` (with a `lineId`), disabled unless every slot is selected + the store is shoppable.
- [ ] `shop.astro` + `[slug].astro` — after the product grid, list active bundles (`listStoreBundlesForGrid`) with a "Bundle" badge, linking to `/shop/[store]/bundle/[slug]` (carry the `?k=` token for unlisted).
- [ ] tsc 0 + `astro build`. Commit `feat(merch): bundle storefront page + grid listing`.

### Task 3.3: E2E — bundle page

- [ ] Add a seeded bundle fixture (idempotent) to `seed-e2e-tests.ts` (a bundle in the general or the unlisted store, ≥2 components). `tests/e2e/merch-bundles.spec.ts`: the bundle page renders slots + a price; the store grid links to it. (Controller seeds + runs on a free port.) Commit `test(merch): bundle storefront e2e + seed fixture`.

---

## Slice 4 — Admin

### Task 4.1: bundle CRUD endpoint

**Files:** Create `src/pages/api/admin/merch/bundles.ts`. Test extend `tests/api/admin/` (new `merch-bundles.test.ts`).

**Interfaces produced:** GET (`?storeId=` list org bundles + a product picker source), POST/PUT/DELETE. POST: `{ storeId, name, slug?, description?, discountType, discountValue, active, components:[{productId, label?, quantity?}] }`. Validate: ≥1 component; every component product is in the store + `source`-agnostic but **all share one `fulfillment_type`** (422 else) — set `merchBundles.fulfillmentType` to that shared type; org-scoped via `getStoreById`; slug unique per store. DELETE: allowed freely (order items snapshot the name); but a component **product** can't be hard-deleted while in a bundle (the `restrict` FK enforces this at the product-delete endpoint — verify store-products DELETE surfaces a clean 409, add if missing).

- [ ] TDD the API test (create bundle w/ components; mixed-fulfillment components → 422; tenant isolation; slug uniqueness). Implement mirroring `store-products.ts`/`stores.ts` (transactional, `requireOrgAdminAccess`, `json` helper). Commit `feat(merch): admin bundle CRUD`.

### Task 4.2: bundle editor UI + order grouping

**Files:** Create `components/admin/merch-bundle-editor.tsx`; modify `pages/admin/merch/stores/[id].astro` (Bundles section), `components/admin/merch-store-orders.tsx` + `lib/merch/order-csv.ts` (group exploded lines by `bundle_name`).

- [ ] Bundle editor: name, discount type+value, component-product multi-picker (from the store's products; show each product's fulfillment type + warn/block on mixing), images, active. Datetime not needed. Wire to `/api/admin/merch/bundles`.
- [ ] Order view + CSV: order items with a `bundle_name` render grouped under the bundle; CSV gains a `bundle` column.
- [ ] tsc 0 + `astro build`. Commit `feat(merch): bundle editor UI + order bundle grouping`.

---

## Final verification (controller)

- `npx tsc --noEmit` 0; `npx vitest run tests/unit/merch/` green; `astro build`.
- Migration 0113 applied + no-drift on staging.
- Dev server on a **free port**; run the bundle API tests (CRUD + checkout) + the bundle E2E; the Shippo-gated self-shipped shipping step asserts `[200,503]`.
- **Live smoke (staging):** admin creates a pickup bundle (2 components) → storefront bundle page → pick variants → cart → pickup checkout (Stripe session) → order shows the components grouped under the bundle, summing to the discounted total.
- Grep `tests/e2e/` for `/shop` specs before merge.

## Self-review (coverage vs spec)

Schema (bundles + bundle_items + order-item cols) → 1.1/1.2. Pricing (full/discounted/distribute, cents-exact) → 1.3. Resolvers → 2.1. Explode + checkout (selection/fulfillment validation, discount distribution, concat, persist bundle fields) → 2.2. Cart union → 3.1. Bundle page + grid (per-slot variant select, live price, unlisted gate) → 3.2. E2E → 3.3. Admin CRUD (single-fulfillment 422, tenant) → 4.1. Editor + order grouping → 4.2. Non-goals (cross-fulfillment, personalization-in-bundle, multi-parcel, nested, digital) → carried, not built. Money authority + off-bundle-variant + rounding + slug collision + migration-number → Risks, addressed in 2.2/1.3/3.2/1.2.
