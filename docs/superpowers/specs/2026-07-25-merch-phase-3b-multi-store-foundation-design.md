# Merch Phase 3b — Multi-Store Foundation

**Date:** 2026-07-25
**Branch:** `feat/merch-phase3b-stores` (off `main` @ `f69e703d`)
**Status:** Design approved; ready for implementation planning.

## Context

The merch shop shipped in three prior increments (all merged to `main`, live on prod):

- **Phase 1** (#479/#480) — Printful-backed browsable catalog: `merch_products` / `merch_variants`, Printful sync, `/shop` grid + `/shop/[slug]` detail.
- **Phase 2** (#481) — transactional buy-flow: `merch_orders` / `merch_order_items`, client cart, `/api/merch/quote` + `/api/merch/checkout` (hosted Stripe Checkout with live Printful shipping + `automatic_tax`), money-safe webhook fulfillment, confirmation email.
- **Phase 3a Wave 1** (#484, migration 0109) — product-model generalization (`source` printful|manual, product-level `fulfillment_type`, nullable Printful ids, `personalization` jsonb) and a `merch_team_kits` table with admin CRUD for team jersey kits.

The owner then **expanded the vision to a multi-store commerce platform**: first-class stores scoped to general / league / team, each with its own storefront and URL; products fulfilled by Printful-POD, self-shipped (live carrier rates), pickup, or digital; sold individually or as bundles. A build-vs-buy evaluation (deep-research on Medusa v2 vs continue-custom) concluded **continue custom** — Medusa collides with Aspire's Stripe Tax setup (Medusa owns tax internally, uses PaymentIntents not Checkout Sessions) and its own Customer/Order model, and its only clear win (sales-channel scoping) is bounded custom work here anyway. Revisit Medusa only at hundreds-of-stores scale.

The platform decomposes into:

- **3b (this spec)** — the multi-store foundation. The keystone. `merch_stores` entity, a storefront + admin per store, and folding pickup checkout into the store frame. Phase 3a Wave 1's team-kit becomes a team-scoped store.
- **3c** — self-shipped products + live carrier rates (Shippo/EasyPost).
- **3d** — bundles / packages + parcel/weight shipping.
- **3e** — digital goods + storefront UX polish + order-management admin.

Stack stays Stripe / Astro / Postgres throughout.

## Goal

Make **stores** a first-class concept. After 3b:

1. The existing Printful catalog is a **general store** served at `/shop`.
2. A **team store** can be created, shared via an unlisted link, and **checked out end-to-end via pickup** (no shipping address, Ohio-origin tax, pickup confirmation email, admin order aggregation + CSV + mark-collected). This completes the pickup path that Phase 3a Wave 2 deferred.
3. `scope=league` exists as an enum value only (seam); league storefronts are a later phase.
4. The `merch_team_kits` table is **removed** — its concept is absorbed into `merch_stores`.

Non-goals (explicitly deferred): self-shipped + live carrier rates (3c), bundles/parcels (3d), digital goods + UX polish + a store-directory page (3e), league storefronts, captain-bulk ordering, cross-store carts.

## Data Model

### New: `merch_stores`

Absorbs everything `merch_team_kits` held, generalized across scopes.

```
merch_stores
  id                uuid pk
  organization_id   uuid  -> organizations (cascade)     not null
  scope             enum merch_store_scope [general | league | team]  not null
  team_id           uuid? -> teams (cascade)             -- required iff scope=team, else null
  name              varchar(255)                         not null
  slug              varchar(140)                         not null   -- unique per org
  description       text?
  visibility        enum merch_store_visibility [public | unlisted]  not null default 'public'
  share_token       varchar(40)?                         -- required iff visibility=unlisted
  order_opens_at    timestamp?                           -- campaign window (from kit)
  order_closes_at   timestamp?                           -- campaign window (from kit)
  pickup_location   text?                                -- (from kit)
  active            boolean  not null default true
  sort_order        integer  not null default 0
  created_at, updated_at  timestamp not null default now()

  unique (organization_id, slug)          -- uq_merch_stores_org_slug
  unique (share_token)                    -- uq_merch_stores_token (partial: where not null)
  index  (organization_id, scope)         -- idx_merch_stores_org_scope
```

**Enums (each pgEnum; adding a value later = its own migration per repo convention):**

- `merch_store_scope`: `general`, `league`, `team`. `league` is seamed but unused in 3b.
- `merch_store_visibility`: `public`, `unlisted`.

**Invariants (enforce in application code + a CHECK where cheap):**

- `scope=team` ⇒ `team_id` not null; `scope != team` ⇒ `team_id` null.
- `visibility=unlisted` ⇒ `share_token` not null; `public` ⇒ `share_token` null.
- Exactly one `scope=general` store per org (the default storefront). Enforced by application logic + a partial unique index `where scope='general'` on `organization_id`.

### Changed: `merch_products`

- **`kit_id` → `store_id`** (`uuid -> merch_stores`, `onDelete: cascade`, **not null** after backfill). Every product belongs to exactly one store.
- Slug uniqueness moves from **per-org** (`uq_merch_products_org_slug`) to **per-store** (`uq_merch_products_store_slug`), so two stores can each have a product slugged `tee`. The org-active index becomes a store-active index `idx_merch_products_store_active`.
- `source`, `fulfillment_type`, `personalization` unchanged. `fulfillment_type` stays **product-level** — a store *may* mix fulfillment types; in practice general=all `printful_pod`, team=all `pickup`.
- Drop the `kit` relation; add a `store` relation.

### Changed: `merch_orders`

- Add **`store_id`** (`uuid -> merch_stores`, `onDelete: restrict`, not null). Records which store the order came from; powers per-store admin aggregation. `restrict` because an order is a financial record — deleting a store must not cascade-delete its orders (deactivate stores instead of deleting once they have orders; see Admin).

### Changed: `merch_order_items`

- Add **`personalization` jsonb** (`$type<OrderItemPersonalization>()`, nullable) — captures the *values* a personalized line was ordered with (e.g. `{ name: "Ramirez", number: "10" }`). Distinct from the product-level `personalization` config (which fields to collect).
- Make **`printful_sync_variant_id` nullable** — pickup/manual items have no Printful id. (Currently `not null`.)

### Changed: `merch_order_status` enum

- Add **`awaiting_pickup`** and **`collected`**. Enum-add ships in its **own migration**, separate from table DDL (repo convention — see 0097/0098 precedent; a `CREATE TYPE ... ADD VALUE` cannot share a transaction with usage of the new value).

### Removed: `merch_team_kits`

Dropped after data backfill (see Migration & Cutover). Safe because the kit surface is days old, has **no customer-facing route** (`/kit/[token]` was never built) and **no order references** (`merch_orders`/`merch_order_items` carry no `kit_id`). Every consumer — `lib/merch/kits.ts`, the admin editor/list components, the `/admin/merch/kits*` pages, the `/api/admin/merch/kits` + `kit-products` endpoints, and their tests — is rewritten into the store equivalents in 3b.

## Routing & Storefront

### Public routes

| Route | Behavior |
|---|---|
| `/shop` | The org's **general store** grid (existing page, now scoped to `store_id` of the general store). Canonical URL for general. |
| `/shop/[slug]` | **Resolver.** If `slug` matches a store → render that store's grid. Else if `slug` matches a legacy general-store product → **301** to `/shop/general/[slug]`. Else 404. |
| `/shop/[store]/[product]` | Product detail, for any store (general products live at `/shop/general/[product]`). |

The `[slug]` resolver order (store first, then legacy product) transparently preserves existing `/shop/hoodie`-style links via redirect while freeing the one-segment namespace for store slugs. Reserve the slug `general` for the general store so its products route consistently at `/shop/general/…`.

### Unlisted (team) stores

- Served at `/shop/[storeSlug]?k=<share_token>`. The store branch of `/shop/[slug]` checks: if `store.visibility === 'unlisted'`, require `?k=` to equal `share_token`, else **404** (not 403 — don't confirm existence). Public stores ignore `k`.
- Unlisted store pages and their product pages set **`noindex`**. Public store/product pages are indexable.
- Product detail under an unlisted store (`/shop/[store]/[product]?k=…`) carries the token through the same gate.

### Window gating (team stores)

- A store with `order_opens_at` / `order_closes_at` shows one of three states via a `storeWindowState(store, now)` helper (moved from `kitWindowState`): `not_open` (countdown to open), `open` (shopping enabled), `closed` (read-only, "ordering has closed"). Add-to-cart and checkout are blocked unless `open`. Server-side re-check at quote/checkout time — never trust client window state.

### Catalog layer changes (`lib/merch/catalog.ts`)

- Generalize from **org-scoped** to **store-scoped**:
  - `listActiveMerchProducts(storeId)` (was `(orgId)`).
  - `getMerchProductBySlug(storeId, slug)` (was `(orgId, slug)`).
- New store resolvers (new `lib/merch/stores.ts`, replacing `lib/merch/kits.ts`):
  - `getGeneralStore(orgId)`, `getStoreBySlug(orgId, slug)`, `getStoreByToken(token)`, `listStores(orgId)`, `getStoreById(orgId, id)`.
  - `storeWindowState(store, now)`.
  - `generateShareToken()` (unchanged).

## Checkout & Fulfillment

### Cart is store-scoped

- `cart-store.ts` tags the cart with a `storeId`. Adding an item from a different store prompts to replace the current cart (you shop one store at a time). This keeps checkout single-store and avoids cross-store fulfillment/tax mixing (cross-store carts are a deferred non-goal).

### General store — Printful path (unchanged)

Live Printful shipping rate, shipping address collected on-site, `automatic_tax` on, order status `pending → paid → submitted → shipped`. No behavior change; the only difference is the cart/quote/checkout now carry `store_id` and persist it on the order.

### Team store — pickup path (finishes deferred Wave 2)

- **Checkout skips the shipping address** (`shipping_cents = 0`). `/shop/checkout` renders a pickup variant: shows `pickup_location` + window instead of an address form; still collects email + any per-item personalization.
- **Stripe Tax on Ohio origin.** With no ship-to address, `automatic_tax` uses the org's origin address (Ohio) — the same registration Phase 2 relies on. Goods tax code `txcd_99999999` as today.
- **Personalization capture:** for products whose `personalization` config requests `name`/`number`, the storefront collects values per line and persists them to `merch_order_items.personalization`. Validate required fields server-side at quote/checkout.
- **Order lifecycle:** `pending → paid → awaiting_pickup → collected`. On paid, the webhook's **pickup branch** does *no* Printful call — it flips the order to `awaiting_pickup` and sends the **pickup confirmation email** (location + window + itemized list w/ personalization; not a tracking number). `collected` is set by admin mark-collected.

### Fulfillment dispatch

- The existing webhook dispatcher branches on `fulfillment_type` (already seamed in Phase 2 with 4 enum values, only `printful_pod` built). 3b builds the **`pickup`** branch. `self_shipped` / `digital` remain unbuilt (3c/3e).
- **Mixed-fulfillment store** (some `pickup` + some `printful_pod` in one cart): if *any* line needs shipping, collect the address and quote Printful shipping for the Printful lines; pickup lines add zero shipping. Robust but not the common path — team stores are pure pickup, general pure Printful. Partition order items by `fulfillment_type` when dispatching.

### `reprice.ts` broadening (the Wave-2-must)

Phase 3a Wave 1 scoped `reprice.ts` to `source='printful'` to keep tsc/Printful-checkout safe with the newly-nullable ids. 3b **broadens reprice to handle `source='manual'` / pickup items** so they reprice server-authoritatively instead of 422-ing. Manual items price from `merch_variants.retail_price_cents` (no Printful lookup); Printful items keep their existing path. Reprice stays dedup-safe and server-authoritative.

## Admin

Nav: **Money → Shop** (stores) — the current `/admin/merch` grows a store list; the kit pages are retargeted to stores.

| Surface | Change |
|---|---|
| `/admin/merch` | **Store list** + the existing Printful **Sync** panel (sync targets the general store). Create / edit / (de)activate stores. |
| `/admin/merch/stores/[id]` | Store editor (was `/admin/merch/kits/[id]`). Fields: name, slug, scope, visibility, team picker (scope=team), window, pickup location, share link (copyable for unlisted). Manual-product editor (was the kit-product editor) for the store's manual products (jerseys w/ sizes + name/number personalization). |
| `/api/admin/merch/stores` | Store CRUD (was `/api/admin/merch/kits`). Org-scoped, transactional PUT/POST, `requireOrgAdminAccess`. |
| `/api/admin/merch/store-products` | Manual product CRUD (was `kit-products`), keyed on `storeId`. |
| **Order management (deferred Wave 2 admin)** | Per-store order list/aggregation, **CSV export** (roster of who ordered what, with sizes + personalization), and **mark-collected** (`awaiting_pickup → collected`). New `/admin/merch/stores/[id]/orders` page + a `PATCH` status endpoint. |

**Deletion vs deactivation:** a store with no orders may be hard-deleted (cascades to its products/variants). A store **with orders** cannot be deleted (the `merch_orders.store_id` FK is `restrict`); the admin deactivates it instead. Surface this in the UI (disable delete, offer deactivate) rather than letting the delete 500.

**Team picker gotcha (carried from Wave 1):** the store editor lists org teams via an org-admin join, **not** `/api/admin/teams` (that endpoint is `requireSuperAdminAccess` and would 403 a non-super org admin). Reuse the Wave 1 approach.

**Datetime gotcha (carried from Wave 1):** window `datetime-local` inputs must use local getters, **not** `toISOString()` (UTC corrupts the window on edit-save). Same bug lives in `discount-codes-list.tsx`; fix it here at minimum.

## Migration & Cutover

Two migrations (DDL vs enum-add split per convention), plus a data backfill.

**Migration A — schema + backfill (one file, additive except the final drop):**

1. `CREATE TYPE merch_store_scope`, `merch_store_visibility`.
2. `CREATE TABLE merch_stores` (+ indexes/uniques).
3. `ALTER TABLE merch_products ADD COLUMN store_id uuid` (nullable initially), FK to `merch_stores`.
4. `ALTER TABLE merch_orders ADD COLUMN store_id uuid` (nullable initially), FK `restrict`.
5. `ALTER TABLE merch_order_items ADD COLUMN personalization jsonb`, `ALTER COLUMN printful_sync_variant_id DROP NOT NULL`.
6. **Backfill (SQL in the migration):**
   - For each org that has any `merch_products`, insert one `scope=general, slug='general', visibility=public` store; set those products' `store_id` to it.
   - For each `merch_team_kits` row, insert a `scope=team` store copying `team_id, name, share_token, order_opens_at, order_closes_at, pickup_location`, `visibility='unlisted'`; set that kit's products (`kit_id`) `store_id` to the new store.
   - Backfill `merch_orders.store_id`: existing orders are all general-store → set to the org's general store. (Prod has few/no merch orders; safe.)
7. `ALTER COLUMN store_id SET NOT NULL` on `merch_products` and `merch_orders`.
8. Add `uq_merch_products_store_slug`; drop `uq_merch_products_org_slug`.
9. **Drop:** `ALTER TABLE merch_products DROP COLUMN kit_id`; `DROP TABLE merch_team_kits`.

Write type-existence guards idempotently (`DO $$ ... EXCEPTION WHEN duplicate_object`) per the drifted-DB convention.

**Migration B — enum values (separate file, runs after A):**

- `ALTER TYPE merch_order_status ADD VALUE 'awaiting_pickup'`; `ADD VALUE 'collected'`. (Own migration — `ADD VALUE` can't be used in the same tx that then references it.)

**Schema module changes:** delete `schema/merch-team-kits.ts`; move `merchProductSourceEnum` + `ProductPersonalization` into `schema/merch.ts` (or a small shared module) since they outlive the kit table; update `schema/index.ts` exports.

## Testing

- **Unit (`tests/unit/merch/`):** rewrite `kits.test.ts` → `stores.test.ts` (`storeWindowState`, resolvers, share-token gen). New: reprice covers manual/pickup items; store-scoped slug uniqueness; personalization required-field validation.
- **API (`tests/api/admin/`):** rewrite `merch-kits.test.ts` / `merch-kit-products.test.ts` → `merch-stores.test.ts` / `merch-store-products.test.ts` (org-scoped CRUD, tenant isolation, delete-blocked-with-orders → deactivate). New: pickup quote/checkout endpoint (address-skip, `shipping_cents=0`, tax present), mark-collected status transition. Authed tenant tests (fast-follow from Wave 1) land here.
- **E2E (`tests/e2e/`):** the `/shop` general storefront still renders + is indexable (existing `landing-pages.spec.ts` noindex assertion — **grep it before merge**, it only runs post-merge in `test-full`). New (optional, gated): unlisted store 404s without token, renders with token + `noindex`.
- **Pre-merge:** `npm run db:generate` (commit the migration), `db:seed:e2e`, `test:api`, `build`, `tsc --noEmit` zero errors. Per the pre-push checklist — schema + new endpoints warrant the full run.

## Risks & Mitigations

- **The general-store backfill picks the wrong store on multi-tenant CI** — every "give me the general store" query MUST filter `scope='general'` **and** `organization_id`, ordered deterministically. One-general-per-org invariant + partial unique index prevents ambiguity.
- **Dropping `merch_team_kits` is the one destructive step** — gated on the backfill running first in the same migration; verified no order/route references exist. If prod has a real kit, the backfill preserves it as a team store.
- **`/shop/[slug]` resolver ambiguity** (store slug vs legacy product slug) — resolution order is store-first-then-legacy-product-301; reserve `general` so it can't collide.
- **Window/visibility bypass** — all gating re-checked server-side at quote/checkout; client state is advisory only.
- **Stale post-merge E2E** — changing `/shop` routing can break `test-full`-only specs; grep `tests/e2e/` for `/shop` and `noindex` before merging (the Phase 1 lesson).

## Slice Plan (for the implementation plan)

Rough decomposition (~5 slices), to be detailed by `writing-plans`:

1. **Schema + migrations + backfill** (stores table, product/order/item changes, enum-add, drop kits) + schema module reshuffle + unit tests for invariants.
2. **Store + catalog layer** (`lib/merch/stores.ts`, store-scoped `catalog.ts`, resolvers, window state) + unit tests.
3. **Storefront routing** (`/shop` general, `/shop/[slug]` resolver + legacy redirect, `/shop/[store]/[product]`, unlisted token gate + noindex, store-scoped cart) + E2E.
4. **Pickup checkout** (address-skip checkout UI, quote/checkout store-aware + Ohio-origin tax, reprice broadening, webhook pickup branch, pickup email, order-item personalization) + API tests.
5. **Admin** (store list + CRUD, retarget kit editor → store/manual-product editor, order aggregation + CSV + mark-collected, delete-vs-deactivate) + API tests.
