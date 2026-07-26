# Merch — Lulu POD Print Books (design)

Date: 2026-07-26
Status: approved by owner

## Context

The merch platform (Phases 1–3e) sells Printful POD apparel, self-shipped goods with live Shippo rates, pickup items, bundles, and digital downloads. The `merch_fulfillment_type` enum and the fulfillment dispatcher (`src/lib/merch/fulfillment.ts`) fail loudly on unknown types — a clean seam for a new provider. The owner has 15 print-first minibooks (5 each soccer/basketball/hockey, `src/data/minibooks/`) and at least one full book (`/books/soccer-fundamentals-6-8`), designed at 6×9 trim with KDP/Lulu in mind.

This phase sells **printed books fulfilled by Lulu print-on-demand** — the second external fulfillment provider after Printful.

## Owner-approved decisions

1. **Decouple PDF generation from the integration.** Lulu consumes admin-uploaded interior + cover PDFs (R2, same pattern as 3e digital assets). The existing Chromium+paged.js generator (`scripts/generate-minibook-pdfs.ts`) stays the offline production path for now; a WeasyPrint-quality migration is a separate later project, decided after a physical proof copy is inspected. The merch code never cares how PDFs were made.
2. **Live Lulu shipping quote; the buyer picks the service level** (Mail/Ground/Expedited/Express as available) from real prices at checkout. This is new UI — today's self-shipped flow silently uses the cheapest Shippo rate with no picker.
3. **Books-only carts (v1).** A cart containing a `lulu_pod` line may contain only `lulu_pod` and `digital` lines. Mixing with Printful/self-shipped/pickup lines is rejected (422) at quote and checkout with a clear message.
4. **Approach A: full native integration with cron-polled status** (no Lulu webhooks — the repo has no provider-webhook precedent, mature cron infra, and low book volume; ~30 min tracking-email latency is acceptable).

## Goal

Sell a printed book end-to-end:
1. Admin creates a book product: fulfillment type `lulu_pod`, a price, a format, a page count, and **two uploaded PDFs** (interior + cover) stored in R2.
2. A buyer carts it, enters a shipping address, **picks a shipping level from live Lulu prices**, and pays.
3. On payment, the webhook **submits a Lulu print job** (signed R2 URLs for the PDFs), stores the print-job id, and sends the order-confirmation email.
4. A cron polls open print jobs; on `SHIPPED` it saves carrier + tracking, marks the order shipped, and sends the shipped email.

Non-goals (deferred): PDF generator changes / cover generation; mixed physical carts; Lulu webhooks; automatic refunds on rejected jobs; formats beyond 6×9 paperback; per-variant books (one format+file set per product); order-management admin and shop UX polish (separate next phases).

## Data model

Two migrations (enum-add must be its own file — 55P04):

- **0115**: `ALTER TYPE merch_fulfillment_type ADD VALUE 'lulu_pod';`
- **0116** — new nullable columns:
  - `merch_products`:
    - `lulu_pod_package_id` varchar(32) — Lulu format SKU (e.g. `0600X0900BWSTDPB060UW444MXX`)
    - `lulu_page_count` integer
    - `lulu_interior_asset_key` varchar(500) — R2 key of the interior PDF
    - `lulu_cover_asset_key` varchar(500) — R2 key of the cover PDF
  - `merch_orders`:
    - `lulu_print_job_id` varchar(64) — idempotency + polling key
    - `lulu_shipping_level` varchar(20) — buyer's picked level, needed at submission

A book product has **one price variant** (like digital — no size/color options). Admin validation: a `lulu_pod` product requires both asset keys, `lulu_page_count > 0`, and a package id.

**Format picker, not raw SKUs:** admin chooses from a curated set mapped to package ids in code (`src/lib/lulu/formats.ts`):
- "6×9 paperback, B&W standard"
- "6×9 paperback, color standard"

## Lulu client — `src/lib/lulu/`

- `client.ts`: OAuth2 client-credentials token from `LULU_CLIENT_KEY` + `LULU_CLIENT_SECRET`, cached in-memory until expiry. Base URL `LULU_API_BASE` (default `https://api.lulu.com`; staging/dev use `https://api.sandbox.lulu.com`). Only the client key and secret are needed (Lulu's third dashboard string is those two base64-encoded).
- Calls:
  1. **Cost calculation** — package id, page count, quantity, destination address → per-shipping-level line-item + shipping costs.
  2. **Create print job** — line items (pod_package_id, page_count, interior + cover **signed R2 GET URLs**, quantity), shipping address, shipping level, `external_id` = our order id, contact email.
  3. **Get print job** — status + tracking (carrier, tracking id/url).
- Signed R2 URLs use a long TTL so Lulu's async fetch/normalization retries never hit expired links.
- `LULU_MOCK=1` (pattern: `R2_MOCK`, `MESSAGING_MOCK`) swaps in a fake client with fixed costs and scriptable job statuses — CI and local runs never touch Lulu.

**Operational prerequisite (owner):** the Lulu account must have a stored payment method — Lulu charges the org per print job (print cost); the buyer pays the org retail via Stripe as usual.

## Checkout flow

- **Quote** (`/api/merch/quote`): for a book cart with an address, one cost-calc call returns available shipping levels with real prices. Response gains `shippingOptions: [{ level, label, amountCents }]` for lulu carts; the cheapest is the default selection.
- **Checkout UI**: a shipping-method radio group renders when `shippingOptions` is present. Selected level is posted to checkout.
- **Checkout** (`/api/merch/checkout`): server-authoritative — re-runs the cost calc for the *selected* level and charges that amount; the client never dictates price (same principle as `resolveSelfShippedRate`). Invalid/unavailable level → 422. Level saved on the order.
- **Books-only rule** enforced in both quote and checkout: any `lulu_pod` line + any non-digital other type → 422 ("Printed books ship separately — please order them on their own").
- Tax: physical-goods default tax code; address always present (books always ship).

## Fulfillment

- `assertSupportedFulfillment` accepts `lulu_pod`; `orderFulfillmentPlan` gains a `lulu` branch (non-empty physical lines all `lulu_pod` → `"lulu"`).
- On payment (`handleMerchOrderCompleted`): submit the print job, save `lulu_print_job_id`, set status `submitted`, send the existing order-confirmation email. Idempotency mirrors Printful: skip submission if `lulu_print_job_id` is already set or status is `submitted`/`shipped`. Digital lines in the same order get their download grants exactly as in 3e (orthogonal).
- **Submission failure** (Lulu down, PDF rejected at normalization): the order stays paid; the error is logged; the cron retries nothing automatically — the order surfaces as stuck-in-`paid` in the admin orders list. Same posture as a Printful submission failure today.

## Status cron — `/api/cron/poll-lulu-jobs`

- `CRON_SECRET`-gated like the other crons; scheduled ~every 30 minutes.
- Finds orders with a `lulu_print_job_id` and status `submitted`; GETs each print job (volume is low — no batching concerns at current scale).
- `SHIPPED` → save carrier + tracking number/url, status `shipped`, send the existing `sendMerchShippedEmail`.
- `REJECTED` / `CANCELED` → status `failed` so it shows in the admin orders list. Refund is a manual admin action in v1.
- Other statuses (`CREATED`, `UNPAID`, `PAYMENT_IN_PROGRESS`, `PRODUCTION_READY`, `IN_PRODUCTION`) → no-op, poll again later.

## Admin

- **Book product form** (existing manual-product admin, `source=manual`): fulfillment type "Book (Lulu print)" reveals: format picker, page count, price, and two PDF upload fields (interior, cover) using the same signed-PUT R2 seam as 3e's digital asset upload.
- **Print-cost preview**: with format + page count set, a "Check print cost" button runs a cost calc against a fixed US reference address and shows the unit print cost, so retail pricing is set with margin visible.
- **Orders**: the existing per-store orders list renders Lulu orders with status + tracking from `merch_orders` — no new order UI in this phase.

## Env

- `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET` — required for live calls (Bitwarden + Netlify).
- `LULU_API_BASE` — optional; set to the sandbox host on staging/local.
- `LULU_MOCK=1` — mock client for CI/local.
- Missing config fails closed: quote/checkout for a lulu cart returns 503 "Shipping unavailable" (same as Shippo-unconfigured behavior); the app still boots (feature-gated like everything else).

## Testing

- **Unit** (`tests/unit/`): books-only cart rule; level re-validation; format→package-id mapping; `orderFulfillmentPlan` lulu branch; client request shaping.
- **API** (`tests/api/`): quote returns `shippingOptions` for a book cart (mocked); checkout 422 on mixed cart and on a bogus level; checkout charges the re-validated server price; cron transitions submitted→shipped and fires the shipped email (mock statuses); `failed` on rejected.
- **E2E** (`tests/e2e/`): admin creates a book product with uploaded PDFs (`R2_MOCK`); buyer checkout renders the level picker and completes (mock Lulu + Stripe test card). Note the post-merge `test-full` gap — run affected specs locally before merge.
- **Go-live validation (owner, manual):** a sandbox print job end-to-end on staging, then **one real proof copy ordered and inspected** before the book store goes public — this is also the quality verdict on the current Chromium/paged.js PDFs vs a WeasyPrint migration.

## Rollout

1. Land the integration behind config-absence (no Lulu keys in prod → book products simply can't be quoted; none will exist yet).
2. Owner: add sandbox keys to staging/Bitwarden, validate; add production keys + Lulu payment method; upload PDFs and create the first book products; proof copy; publish.
