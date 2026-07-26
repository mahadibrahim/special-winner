# Merch Phase 3e-i — Digital Goods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sell digital downloads — a store product delivered as a downloadable file after purchase, via a persistent (6-month) re-downloadable tokenized link backed by short-lived signed R2 URLs.

**Architecture:** A digital product = a `merch_products` row with `fulfillment_type='digital'` + an R2 asset key. Checkout treats digital lines as no-shipping/no-address (like pickup) but with a digital tax code. The webhook creates a `merch_download_grants` row per digital order-item (orthogonal to the fulfillment plan) + emails a delivery link; a `/shop/download/[token]` endpoint validates the grant and redirects to a signed R2 GET URL. Admin uploads the file via an R2 signed PUT. Reuses 3b/3c store/checkout/webhook seams + `src/lib/storage/r2.ts`.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle + Postgres, Stripe hosted Checkout + Stripe Tax, Cloudflare R2 (`@aws-sdk` presign), Vitest, Playwright.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-merch-phase-3e-digital-goods-design.md`. Every task implicitly includes it.
- **Owner decisions (fixed):** digital download (not Lulu POD); persistent re-downloadable tokenized link; **6-month** grant expiry; guest-friendly (no account).
- **Money/authority unchanged:** server-authoritative pricing; org-scoped admin; grants are tied to the buyer's order-item.
- **Grant idempotency:** a re-fired webhook must not double-grant or double-email (guard by existing-grant-per-order-item).
- **R2-gated:** admin upload + downloads require `R2_*` env; without it, fail gracefully (503 / clear error). No other path affected.
- **Digital tax code:** `DIGITAL_TAX_CODE = "txcd_10501000"` (owner confirms); physical/pickup lines keep `MERCH_TAX_CODE = "txcd_99999999"`.
- **Migration `0114`** (renumber if `main` merges another migration first — the 3b concurrent-number lesson). Idempotent guards. `delivered` enum-add is `ADD VALUE IF NOT EXISTS`, not used in-migration (in-tx safe).
- **Worktree:** `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/merch-phase3e-digital`, branch `feat/merch-phase3e-digital`. No local node_modules — use `npx`. Dev/test DB = staging via bws. **Port 4321 may be held by another session** — controller runs the dev server on a free port. **Any new E2E must use a specific heading locator** (`getByRole("heading",{name})`), not a bare `page.locator("h1")` — the 3d post-merge strict-mode lesson.
- Amounts integer cents; usd. Commit after each task; end messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

## File Structure

**New:** `schema/merch-downloads.ts` (`merchDownloadGrants`); `lib/merch/digital-delivery.ts` (grant helpers + `DIGITAL_TAX_CODE` + `sendMerchDigitalDelivery`... email lives in order-confirmation-email.ts — see 3.2); `pages/shop/download/[token].ts`; `pages/api/admin/merch/digital-asset-url.ts`; migration `0114_merch_digital`.
**Modified:** `schema/merch.ts` (product `digitalAssetKey`/`digitalAssetName`); `schema/merch-orders.ts` (`delivered` enum); `schema/index.ts`; `lib/merch/checkout-line-items.ts` (`DIGITAL_TAX_CODE`, per-line `taxCode`); `pages/api/merch/checkout.ts` + `quote.ts` (pure-digital address-skip; digital tax code); `lib/merch/fulfillment.ts` (digital grant generation in `handleMerchOrderCompleted`); `lib/merch/order-confirmation-email.ts` (`sendMerchDigitalDelivery`); `pages/api/admin/merch/store-products.ts` + `components/admin/merch-store-editor.tsx` (digital option + upload); `pages/shop/order.astro` (download links).

---

## Slice 1 — Schema + grant helpers

### Task 1.1: schema (product asset cols + grants table + delivered enum)

**Files:** modify `schema/merch.ts`, `schema/merch-orders.ts`, `schema/index.ts`; create `schema/merch-downloads.ts`. Test `tests/unit/merch/digital-schema.test.ts`.

**Interfaces produced:** `merchProducts.digitalAssetKey` (varchar 500, nullable) + `digitalAssetName` (varchar 255, nullable); `merchDownloadGrants` table (id, orderItemId→merchOrderItems cascade, token unique, assetKey, assetName, expiresAt, downloadCount default 0, createdAt; index orderItemId); `merchOrderStatusEnum` gains `delivered`.

- [ ] Step 1: failing test asserting the product cols, the grants table cols, and `merchOrderStatusEnum.enumValues` includes `"delivered"`.
- [ ] Step 2: FAIL. Step 3: add product cols (after `images`); create `merch-downloads.ts` (mirror `merch-bundles.ts` idiom, FK to `merchOrderItems` from `./merch-orders`, cascade); export from index; add `"delivered"` to `merchOrderStatusEnum`. Step 4: PASS + `tsc` 0. Step 5: commit `feat(merch): digital asset cols + download grants + delivered status`.

### Task 1.2: migration 0114 (controller)

- [ ] `npx drizzle-kit generate --name merch_digital` (columns + a table + an enum ADD VALUE; if a prompt appears drive with `expect`, answer "create"). Hand-edit `.sql` idempotent: `ADD COLUMN IF NOT EXISTS` (product cols), `CREATE TABLE IF NOT EXISTS` + guarded FK/index for grants, `ALTER TYPE merch_order_status ADD VALUE IF NOT EXISTS 'delivered'`. Apply to staging; `db:generate` no drift. Commit `feat(merch): migration 0114 — digital goods`.

### Task 1.3: grant helpers + digital tax code

**Files:** create `src/lib/merch/digital-delivery.ts`; modify `src/lib/merch/checkout-line-items.ts`. Test `tests/unit/merch/digital-delivery.test.ts`.

**Interfaces produced:**
- `DIGITAL_TAX_CODE = "txcd_10501000"` (checkout-line-items.ts); `buildMerchLineItems` gains a per-line `taxCode?` on `MerchLineInput` (defaults to `MERCH_TAX_CODE`).
- `generateDownloadToken(): string` (32+ url-safe hex, like `generateShareToken`); `grantExpiryFrom(purchasedAt: Date): Date` (+6 months); `isGrantExpired(grant, now): boolean`.

- [ ] Step 1: failing test — `generateDownloadToken` shape+uniqueness; `grantExpiryFrom(d)` is 6 months after `d`; `isGrantExpired` true past expiry / false before; `buildMerchLineItems` emits a line's `taxCode` when given, else `MERCH_TAX_CODE`. Step 2: FAIL. Step 3: implement (pure). Step 4: PASS + tsc 0. Step 5: commit `feat(merch): digital tax code + download-grant helpers`.

---

## Slice 2 — Checkout (digital tax + address-skip)

### Task 2.1: digital lines in checkout/quote

**Files:** modify `pages/api/merch/checkout.ts`, `quote.ts`, `lib/merch/checkout-store.ts`. Test unit for the address-requirement helper + the Slice-4 API test.

**Interfaces:** `checkout-store.ts` — confirm `lineNeedsShipping` excludes `digital` (it does: only printful/self_shipped). Add a pure `cartNeedsAddress(lines): boolean` = `lines.some(lineNeedsShipping)` (address required iff any physical line). `partitionByFulfillment` — digital lines are simply non-shipping (no new bucket needed unless the code assumes every non-pickup line ships; verify).

- [ ] Step 1: unit-test `cartNeedsAddress` (pure-digital → false; digital+printful → true; pure-pickup → false).
- [ ] Step 2: `checkout.ts` — the address-required gate for the shipping branch already keys on `needsShipping`; ensure a **pure-digital cart** is NOT forced to provide an address (it isn't, since digital adds 0 shipping and no branch requires it — verify the order insert's `shippingAddress` handles a no-address digital order like pickup does, reusing the pickup placeholder). Each **digital** line's Stripe line item uses `DIGITAL_TAX_CODE`; physical/pickup keep `MERCH_TAX_CODE` — thread the per-line `taxCode` from the repriced line's `fulfillmentType` (`digital` → DIGITAL_TAX_CODE) into `buildMerchLineItems`. `automatic_tax` stays on.
- [ ] Step 3: `quote.ts` — same (digital adds 0 shipping; no address needed for a pure-digital quote).
- [ ] Step 4: tsc 0 + `astro build`. Commit `feat(merch): digital lines — digital tax code, address-free pure-digital checkout`.

---

## Slice 3 — Webhook grants + delivery + download endpoint

### Task 3.1: webhook digital grant generation + delivery email

**Files:** modify `lib/merch/fulfillment.ts`, `lib/merch/order-confirmation-email.ts`. Test `tests/unit/merch/digital-dispatch.test.ts`.

**Interfaces:** pure `orderHasDigital(items): boolean` and `orderIsAllDigital(items): boolean` (in fulfillment.ts). `sendMerchDigitalDelivery(orderId)` (order-confirmation-email.ts) — lists each digital item's download URL. In `handleMerchOrderCompleted`, after mark-paid: for each `digital` order-item, look up its product's `digitalAssetKey`/`Name` (via variant→product) and **create a `merch_download_grants` row** (skip if one already exists for that order-item — idempotent), `expiresAt = grantExpiryFrom(now)`; if `orderHasDigital` → `sendMerchDigitalDelivery(orderId)` (guarded); if `orderIsAllDigital` → set status `delivered` and return `{status:"processed-digital"}`; else fall through to the existing plan dispatch (physical items).

- [ ] Step 1: failing test for `orderHasDigital`/`orderIsAllDigital` (+ the delivery email builder shows a download link). Step 2: FAIL. Step 3: implement (grant creation idempotent; email; status). Step 4: PASS + tsc 0. Step 5: commit `feat(merch): webhook creates download grants + sends digital delivery`.

### Task 3.2: download endpoint + order-page links

**Files:** create `src/pages/shop/download/[token].ts`; modify `src/pages/shop/order.astro`. Test `tests/api/merch/digital-download.test.ts` (controller-run).

**Interfaces:** GET `/shop/download/[token]` — load grant by token (404 if none); if `isGrantExpired` → a friendly expiry response (200 with a "link expired" message page, or 410); else increment `downloadCount`, generate a **short-lived signed R2 GET URL** via `getSignedGetUrl(assetKey, { expiresIn: 300, responseContentDisposition: 'attachment; filename="<assetName>"' })` (check `r2.ts`'s `getSignedGetUrl` signature — extend it to pass `ResponseContentDisposition` if it doesn't already), and **302 redirect**. `order.astro` — for a digital order (resolve its grants by the session's order), render the download link(s).

- [ ] Step 1: write the API test (valid token → 302 to a signed URL or 200 with a link; expired grant → expiry message; unknown token → 404). Step 2: implement the endpoint + order-page links. Step 3: tsc 0 + `astro build`. Step 4: commit `feat(merch): download endpoint (signed R2 redirect) + order-page links`. (Controller runs the API test.)

---

## Slice 4 — Admin (digital product + upload)

### Task 4.1: R2 upload presign endpoint

**Files:** create `src/pages/api/admin/merch/digital-asset-url.ts`. Test extend an admin API test.

**Interfaces:** `POST /api/admin/merch/digital-asset-url` — org-admin gated (`requireOrgAdminAccess`); body `{ filename, contentType }`; returns `{ uploadUrl, key }` where `key = merch-digital/<orgId>/<uuid>-<sanitized filename>` and `uploadUrl` = `getSignedPutUrl(key, contentType, { expiresIn })` (check `r2.ts` `getSignedPutUrl` signature); 503 if R2 unconfigured. Validate contentType is an allowed doc/pdf type.

- [ ] Implement + a small API test (unauth → 401/403; returns an uploadUrl+key; 503 without R2 — gate the assertion). Commit `feat(merch): admin R2 presign for digital assets`.

### Task 4.2: digital product creation + editor UI

**Files:** modify `pages/api/admin/merch/store-products.ts`, `components/admin/merch-store-editor.tsx`. Test extend `tests/api/admin/merch-store-products.test.ts`.

**Interfaces:** store-products schema gains `fulfillmentType: "pickup" | "self_shipped" | "digital"`; when `digital`, require `digitalAssetKey` + `digitalAssetName` (422 otherwise), persist them on the product, create exactly ONE variant at the given price (no sizes/weight). Editor: the fulfillment select gains `Digital`; when digital, hide sizes/weight, show a **single price** + a **file upload** (request `digital-asset-url`, PUT the file to R2, then include `digitalAssetKey`/`digitalAssetName` in the product save). Validate asset present client-side too.

- [ ] Step 1: failing API test — create a digital product with an asset → persists `fulfillment_type='digital'` + asset cols + one variant; without an asset → 422. Step 2: implement endpoint + editor. Step 3: tsc 0 + `astro build`. Step 4: commit `feat(merch): admin digital product creation with R2 upload`.

---

## Final verification (controller)

- `npx tsc --noEmit` 0; `npx vitest run tests/unit/merch/` green; `astro build`.
- Migration 0114 applied + no-drift on staging.
- Dev server on a **free port**; run the digital API tests (product creation, download endpoint, presign) + a digital checkout smoke (create a digital product w/ a tiny uploaded asset → checkout no-address → webhook-sim → grant + `delivered` → `/shop/download/<token>` 302 → re-download → expired-grant page).
- **Live smoke** (needs R2 + `stripe listen`): upload a PDF → digital product → checkout → grant + delivery email → download works. Defer if R2 test creds unavailable locally — note it.
- Grep `tests/e2e/` for `/shop`; any new E2E uses a specific heading locator.

## Self-review (coverage vs spec)

Schema (product asset + grants + delivered) → 1.1/1.2. Grant helpers + digital tax → 1.3. Checkout (digital tax code, address-free pure-digital) → 2.1. Webhook grants (idempotent, orthogonal to plan) + delivery email → 3.1. Download endpoint (signed-GET redirect, expiry) + order links → 3.2. Admin presign → 4.1. Digital product creation + upload UI → 4.2. Non-goals (Lulu POD, DRM, count caps, per-variant assets, large-file streaming) → carried. Money authority + grant idempotency + signed-URL leakage + digital tax + mixed-order + migration-number → Risks, addressed across slices.
