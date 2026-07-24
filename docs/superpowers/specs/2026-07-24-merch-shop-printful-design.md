# Merch Shop (Printful) — Design

**Date:** 2026-07-24
**Branch:** `feat/merch-shop-printful`
**Status:** Approved design — pending implementation plan

## Summary

Add an in-site print-on-demand merch shop backed by **Printful**, paid through the
existing **Stripe** infrastructure. Products are designed in Printful's dashboard
and synced into a lightweight local catalog; buyers shop on our own storefront,
check out via **hosted Stripe Checkout**, and paid orders are **auto-submitted to
Printful** for fulfillment.

The MVP is a **general Aspire-branded storefront**, but the data model is built
org-scoped and extensible so **team-specific stores** can be added later without a
rewrite.

## Goals / Non-goals

**Goals**
- Browsable storefront of Aspire merch at `/shop` (replaces the current "coming soon" placeholder).
- Printful catalog sync (products designed in Printful, pulled into our DB).
- Guest-friendly checkout (no forced account) with live Printful shipping rates and Stripe Tax.
- Fully automated fulfillment: paid order → Printful order created via webhook.

**Non-goals (this iteration)**
- Team-specific stores / per-player personalization (foundation only; not built).
- A product-design experience in our app (Printful's dashboard owns art/mockups/variants).
- Server-persisted carts (client-side cart is sufficient for MVP).
- Post-purchase order tracking UI beyond a confirmation page (Printful shipped-status webhook is an optional later add).

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Product source | Design in Printful, sync into our DB | Least code; Printful owns art, mockups, variants, retail price. |
| Checkout style | Hosted Stripe Checkout Session | Native shipping-address collection + Stripe Tax; matches existing drop-in/rental pattern. |
| Shipping cost | Live Printful rates | Accurate POD shipping. Requires collecting the address on-site *before* session creation (see Flow). |
| Fulfillment | Auto-submit on payment | Hands-off; webhook creates the Printful order. |
| Sales tax | Stripe Tax enabled (`automatic_tax`) | Physical goods are taxable. Requires an Ohio registration in the Stripe Tax dashboard (owner action). |
| Catalog storage | New `merch_*` tables | The existing program-gear `products`/`product_variants` tables have a different purpose and no Printful sync fields. |
| Order financials | Tracked in `merch_orders`, not the `payments` table | Keeps registration revenue reporting clean. |
| Build order | Phased — catalog first, then transactional | Two smaller PRs, matches the repo's one-at-a-time cadence. |

## Consequence to note: address-first checkout

Hosted Stripe Checkout cannot call Printful mid-session to recompute shipping based
on the address the buyer types on Stripe's page. Because we want **live Printful
rates**, the address is collected on **our** site first:

```
cart → on-site address step → POST /api/merch/quote (Printful shipping rate)
     → POST /api/merch/checkout (create Stripe session w/ locked shipping rate)
     → redirect to Stripe hosted payment
```

The address form lives in our app; Stripe collects payment (and computes tax) with
the shipping details we pass in.

## Phasing

### Phase 1 — Catalog (browsable, no purchasing)
- New `merch_*` schema + migration.
- Printful client (`src/lib/printful/client.ts`).
- Admin-triggered sync endpoint `POST /api/admin/merch/sync` (tenant-guarded).
- Storefront: `/shop` grid + `/shop/[slug]` product detail (mockups + variant picker), replacing `shop.astro`.

### Phase 2 — Transactional (cart → checkout → fulfillment)
- Client-side cart (localStorage island) + cart UI.
- `POST /api/merch/quote` and `POST /api/merch/checkout` (guest-allowed).
- Stripe Checkout Session creation with computed shipping option + `automatic_tax`.
- Webhook `merch_order` branch → mark paid → create Printful order → confirmation email.
- Return / thank-you page.

Each phase ships as its own PR with its own implementation plan.

## Data model (new, org-scoped)

- **`merch_products`** — `id`, `organization_id`, `printful_sync_product_id` (unique),
  `name`, `slug`, `description`, `images` (jsonb — mockups), `category`, `active`,
  `synced_at`, timestamps.
- **`merch_variants`** — `id`, `product_id` (FK), `printful_sync_variant_id`,
  `printful_variant_id` (catalog variant, used for rates + orders), `size`, `color`,
  `sku`, `retail_price_cents`, `active`.
- **`merch_orders`** — `id`, `organization_id`, `user_id` (guest-upserted), `email`,
  `status` enum (`pending → paid → submitted → shipped → cancelled | failed`),
  `stripe_checkout_session_id`, `stripe_payment_intent_id`, `printful_order_id`,
  `shipping_address` (jsonb), `subtotal_cents`, `shipping_cents`, `tax_cents`,
  `total_cents`, timestamps.
- **`merch_order_items`** — `id`, `order_id` (FK), `merch_variant_id` (FK) plus
  denormalized snapshot (`name`, `size`, `color`, `unit_price_cents`), `quantity`.

Migration generated via `db:generate` and committed (never `db:push` to remote).

## Printful integration layer — `src/lib/printful/client.ts`

Token-auth client (env `PRINTFUL_API_KEY`, optional `PRINTFUL_STORE_ID`). Methods:
- `listStoreProducts()` / `getSyncProduct(id)` — for catalog sync.
- `calculateShipping(recipient, items)` — for the quote step.
- `createOrder(order, { confirm: true })` — auto-fulfill on payment.
- `getOrder(id)` — status lookups (later).

All Printful calls are server-side only. Retail prices come from Printful's
`retail_price` per sync variant — no separate pricing admin.

## Reuse (no changes needed)

- Stripe client + hosted Checkout Session pattern (as used by drop-ins/rentals).
- Webhook pipeline `src/pages/api/webhooks/stripe.ts` → `handle-stripe-event.ts`
  `dispatch()` + the `stripe_events` idempotency ledger. Add one `metadata.type ===
  "merch_order"` branch.
- `upsertGuestUser` for account-less buyers (satisfies the `user_id` requirement).
- Resend email for order confirmation, respecting the `MESSAGING_LIVE` gate.
- `BaseLayout`, UI feedback primitives (`ErrorBanner`, `EmptyState`, `LoadingSkeleton`),
  `useHydrationBeacon`, middleware org resolution.

## Storefront

- `/shop` — SSR grid of active `merch_products`, org-scoped, extends `BaseLayout`.
- `/shop/[slug]` — product detail: Printful mockups, size/color variant picker,
  add-to-cart. Top-level island calls `useHydrationBeacon`.
- Replaces `src/pages/shop.astro` (currently a `noindex` placeholder).

## Checkout & fulfillment flow

1. Cart (client-side) → `/shop/checkout` address step.
2. `POST /api/merch/quote` (guest-allowed) — revalidate variant prices from DB, call
   Printful `calculateShipping`, return shipping + tax-inclusive totals.
3. `POST /api/merch/checkout` (guest-allowed) — `upsertGuestUser(email)`, insert
   `merch_orders` (`pending`) + items, create Stripe Checkout Session
   (`mode=payment`, line items from cart, single computed shipping option,
   `automatic_tax.enabled=true`, `metadata.type="merch_order"`,
   `metadata.orderId`), return session URL → redirect.
4. Buyer pays on Stripe's hosted page.
5. Webhook `checkout.session.completed` with `metadata.type === "merch_order"` →
   mark order `paid` (store PI id + Stripe-computed tax), **create Printful order**
   (`confirm: true`) with recipient + items + shipping, store `printful_order_id`,
   set `submitted`, send confirmation email.
6. Return page (thank-you) keyed by order id.
7. *(Optional, later)* Printful order-status webhook → `shipped` + tracking email.

## Error handling

- Quote/checkout endpoints: IP rate-limit (mirror the guest-checkout limiter),
  Zod-validate cart + address, re-price server-side (never trust client prices).
- Webhook: idempotent via the existing `stripe_events` ledger; a Printful
  `createOrder` failure marks the order `paid` but not `submitted` and surfaces in
  admin for retry (payment already captured — never silently drop).
- Printful client: typed errors, timeouts, and a clear failure surface (no silent
  swallowing).

## Testing

- **Unit:** cart total math; Printful request/response payload mapping (mocked).
- **API:** `quote` and `checkout` endpoints (mock Printful + Stripe).
- **Webhook:** the `merch_order` branch — paid → Printful order created (mocked).
- **E2E:** deferred — needs live Stripe + Printful, consistent with existing
  Stripe-dependent test gaps.

## Owner actions / env

- Add `PRINTFUL_API_KEY` (+ `PRINTFUL_STORE_ID` if used) to Bitwarden `aspire-web-app`.
- Create products in the Printful dashboard (art, garments, mockups, retail prices).
- Register **Ohio** in the Stripe Tax dashboard so `automatic_tax` collects correctly.

## Optional: agentic store management

The community [Printful MCP server](https://github.com/Purple-Horizons/printful-mcp)
(17 tools — catalog, orders, mockups, shipping) can be added to the Claude Code MCP
config as a natural-language management layer. Independent of this build; vet before
granting order-write access.
