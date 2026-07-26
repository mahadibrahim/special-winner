# Merch Phase 3e (i) — Digital Goods (downloadable guides)

**Date:** 2026-07-26
**Branch:** `feat/merch-phase3e-digital` (off `main`, which has Phases 3b + 3c + 3d)
**Status:** Design — awaiting review before implementation planning.

## Context

The merch platform sells physical goods (Printful POD, self-shipped w/ live Shippo rates), pickup, and bundles. The `digital` value in `merch_fulfillment_type` is seamed since 3b but its dispatcher/checkout branch is unbuilt — it's the last unbuilt fulfillment type. The app already has: R2 object storage with signed GET/PUT helpers (`src/lib/storage/r2.ts`, gated by `R2_*` env), a store/product/checkout/webhook pipeline (3b/3c), and an address-skip checkout path (pickup). The owner has coaching guides (curriculum content, producible as PDFs) to sell.

This phase builds **digital downloads**: a store product delivered as a downloadable file after purchase. (Selling the guides as **Lulu POD print books** is a deliberately separate, larger later phase — a new fulfillment-provider integration; NOT in scope here.)

## Owner-approved decisions

1. **Digital download**, not Lulu POD (this phase).
2. **Persistent, re-downloadable link** (not one-time/expiring) — guest-friendly, no account required.
3. **Six-month expiry** on the download grant (from purchase); no hard download-count cap.

## Goal

Sell a digital product end-to-end:
1. Admin creates a digital product in a store: `fulfillment_type = digital`, a **price**, and an **uploaded file** (the guide PDF, stored in R2).
2. A buyer adds it to the cart and checks out — **no shipping, no address** (a pure-digital cart is address-free), **digital tax code**, guest-friendly.
3. On payment, the webhook creates a **download grant** per digital order-item, sends a **delivery email** with the download link, and marks the order `delivered`.
4. The buyer downloads via a **persistent tokenized link** (`/shop/download/[token]`) — re-downloadable for **6 months** — which redirects to a short-lived signed R2 URL. The link also appears on the order-confirmation page.

Non-goals (deferred): Lulu POD print books (separate phase); DRM/watermarking; download-count caps; per-variant digital assets (one file per digital product); large-file streaming/chunking (guides are small PDFs); a "digital-only store" concept (a digital product lives in any store like any product).

## Data model

### Changed: `merch_products` — the digital asset
- `digital_asset_key` varchar(500), nullable — the R2 object key of the file (set for `fulfillment_type='digital'`).
- `digital_asset_name` varchar(255), nullable — the original filename shown to the buyer (e.g. `U8-Curriculum.pdf`).

A digital product has **one price variant** (no size/color/weight); the file lives on the product. Validated in admin: a `digital` product requires `digital_asset_key`.

### New: `merch_download_grants`
```
merch_download_grants
  id                uuid pk
  order_item_id     uuid -> merch_order_items (cascade)   not null
  token             varchar(64) unique not null           -- the /shop/download/<token> key
  asset_key         varchar(500) not null                 -- SNAPSHOT of the R2 key at grant time
  asset_name        varchar(255) not null                 -- snapshot filename
  expires_at        timestamp not null                    -- purchase + 6 months
  download_count    integer not null default 0            -- observability; no cap in 3e-i
  created_at        timestamp not null default now()
  index (order_item_id); unique (token)
```
Snapshotting `asset_key`/`asset_name` means a later admin file swap doesn't change what a past buyer downloads.

### Changed: `merch_order_status` enum
- Add **`delivered`** (for a fully-delivered digital order). Enum-add ships in its own migration statement, `ADD VALUE IF NOT EXISTS` (not *used* within the migration → in-tx-safe per the repo runner).

## Admin — digital product creation

Extend the manual-product editor (`store-products.ts` + `merch-store-editor.tsx`, from 3b/3c which already handles `pickup`/`self_shipped`):
- The manual-product **fulfillment choice** gains `digital` (alongside `pickup`, `self_shipped`).
- When `digital`: hide the size/weight inputs; show a **single price** + a **file upload**. Reuse the R2 signed-PUT flow (`src/lib/storage/r2.ts` presigned PUT + the existing upload idiom): request a signed PUT URL from a new `POST /api/admin/merch/digital-asset-url` (org-admin gated, returns `{ uploadUrl, key }` for a `merch-digital/<org>/<uuid>-<filename>` key), the client PUTs the file directly to R2, then the product save persists `digital_asset_key`/`digital_asset_name`. A `digital` product creates exactly one variant at the given price. Validate the asset is present (422 otherwise). The `source='manual'` guard and tenant isolation stay.

## Checkout

Digital lines behave like pickup for shipping (no address, `shipping=0`) but with a **digital tax code**:
- `checkout-line-items.ts` — add `DIGITAL_TAX_CODE` (e.g. `txcd_10501000`, "digital books/e-books" — owner confirms against their Stripe Tax categories) and use it for `digital` lines; physical/pickup lines keep `MERCH_TAX_CODE` (`txcd_99999999`). `buildMerchLineItems` takes each line's tax code.
- `checkout-store.ts` `lineNeedsShipping` — `digital` is already false (only `printful_pod`/`self_shipped` need shipping); confirm `partitionByFulfillment` doesn't misroute digital (add a `digital` bucket if needed, else it's just a no-shipping line).
- `/quote` + `/checkout` — a **pure-digital cart requires no address** (like pure-pickup); a mixed cart with any physical line still collects the address (unchanged). Digital lines contribute 0 shipping. `automatic_tax` stays on; Stripe computes digital tax from the buyer's location (email/inferred) or origin — verify digital tax works without a ship-to (Stripe uses the customer's provided/inferred location; if none, the org origin, same as pickup).
- Order items persist normally; a digital line's `fulfillment_type='digital'` is the discriminator the webhook keys on.

## Fulfillment (webhook) + delivery

### Webhook — grants are orthogonal to the fulfillment plan
In `handleMerchOrderCompleted`, after the mark-paid step and BEFORE/ALONGSIDE the existing plan dispatch:
- Query the order's items; for **every `digital` item**, create a `merch_download_grants` row (fresh `token`, `asset_key`/`asset_name` snapshot from the item's product, `expires_at = now + 6 months`).
- If the order has any digital items, send a **digital delivery email** (`sendMerchDigitalDelivery(orderId)`) listing each download link (`<appUrl>/shop/download/<token>`).
- **Status:** if the order is *entirely* digital → set `delivered`. If mixed (digital + physical) → the physical `orderFulfillmentPlan` dispatch runs as today (printful submit / self_shipped stays-paid / pickup awaiting_pickup) and the digital items are delivered in parallel via their grants (status follows the physical path; the download links are still emailed + on the order page). This keeps digital grant-generation orthogonal to the plan enum — no `digital` value added to `orderFulfillmentPlan`.
- Money-safe + idempotent: grant creation guards against duplicates (skip if a grant already exists for the order-item — a re-fired webhook doesn't double-grant), consistent with the existing `status !== 'pending'` guard.

### Download endpoint
`src/pages/shop/download/[token].ts` (or `.astro`) — GET:
- Load the grant by `token`; 404 if missing.
- If `now > expires_at` → a friendly **"download link expired"** page (410/200 with a message).
- Increment `download_count`; generate a **short-lived signed R2 GET URL** for `asset_key` (via `r2.ts`'s signed-GET helper, ~5-min expiry) with a `Content-Disposition: attachment; filename="<asset_name>"`; **302 redirect** to it. Re-usable (token persists until `expires_at`).

### Order-confirmation page
`/shop/order?session_id=…` (existing) — for a digital order, show the download link(s) (resolve the order's grants) so the buyer can download immediately without waiting for the email.

## Storefront

- A digital product renders on the normal product page + store grid (it's a `merch_products` row). The product detail page's add-to-cart works unchanged (one variant). A small "Digital download" badge/label + no size selector.
- Cart: a digital line is an ordinary product `CartItem` (fulfillment_type digital, no personalization/size). No cart changes needed beyond what exists.

## Migration

`migration 0114_merch_digital` (renumber if `main` merges another migration first — the 3b concurrent-number lesson):
- `ALTER TABLE merch_products ADD COLUMN IF NOT EXISTS digital_asset_key varchar(500)`, `digital_asset_name varchar(255)`.
- `CREATE TABLE IF NOT EXISTS merch_download_grants` (+ FK cascade, unique token, index).
- `ALTER TYPE merch_order_status ADD VALUE IF NOT EXISTS 'delivered'` (safe in-tx — not used in this migration).
- Idempotent guards throughout. Apply + verify on staging; `db:generate` no drift.

## Env / owner action

- **R2 must be configured in prod** (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`) — it already is (media uses it). Digital assets go under a `merch-digital/` prefix. Without R2, admin upload + downloads fail gracefully (503/clear error); no other path affected.
- **Confirm `DIGITAL_TAX_CODE`** matches the org's Stripe Tax product categories (default `txcd_10501000`).
- `MESSAGING_LIVE=yes` in prod for the real delivery email (same gate as other merch emails).

## Testing

- **Unit:** grant token generation; expiry check (expired → blocked); the digital-line tax-code selection in `buildMerchLineItems`; the "pure-digital cart needs no address" branch; grant idempotency (a second webhook doesn't double-grant).
- **API:** admin digital product creation (requires asset → 422 without; persists key/name); a digital checkout test — create a digital product, checkout (no address) → session (or 503 no-Stripe on CI gate), webhook simulation → grant created + status `delivered`; the download endpoint returns a redirect for a valid token and an expired-message for an expired grant; tenant isolation.
- **Live smoke (staging, R2 configured):** admin uploads a small PDF → digital product → storefront → checkout (no address) → `stripe listen`-forwarded payment → grant + delivery email → `/shop/download/<token>` redirects to a working signed URL → re-download works → an expired grant shows the expiry page.
- Grep `tests/e2e/` for `/shop` specs before merge; run new merch E2E on a free port (4321 may be held by another session), and use a **specific heading locator** in any new E2E (the bundle-page `h1` strict-mode lesson).

## Slice plan (for the implementation plan)

1. **Schema + migration + R2 download helper** — product asset cols + `merch_download_grants` + `delivered` enum (migration 0114); a `merch/digital-delivery.ts` grant helpers (create/token/expiry) + `DIGITAL_TAX_CODE`; unit tests.
2. **Checkout** — digital tax code per line; pure-digital cart address-skip; partition confirms digital = no-shipping + API test.
3. **Webhook + delivery** — digital grant generation (orthogonal to plan, idempotent) + `sendMerchDigitalDelivery` email + `/shop/download/[token]` endpoint (signed-GET redirect + expiry page) + order-page download links + unit/API tests.
4. **Admin** — digital fulfillment option + R2 file upload (`digital-asset-url` presign endpoint + editor upload UI) + digital product creation validation + API test.

## Risks

- **Grant idempotency** — a re-fired webhook must not double-grant or double-email; guard by existing-grant check per order-item.
- **Signed-URL leakage** — the redirect URL is short-lived (~5 min); the persistent link is the tokenized endpoint, not the raw R2 URL. `Content-Disposition: attachment` forces download.
- **Digital tax** — verify Stripe computes digital tax without a ship-to (uses buyer/origin location); the `DIGITAL_TAX_CODE` must match the org's registrations.
- **Mixed digital+physical order** — digital delivered via grants regardless of the physical plan; the order status follows the physical path (documented). A pure-digital order → `delivered`.
- **Concurrent migration number** — renumber 0114 if another migration lands first.
- **Money authority / tenant isolation** — unchanged from 3b/3c (server-authoritative pricing; org-scoped admin + grants tied to the buyer's order).
