# Merch Shop (Printful) — Phase 2 Design: Transactional buy-flow

**Date:** 2026-07-24
**Branch:** `feat/merch-shop-phase2`
**Status:** Approved design — pending spec review
**Predecessor:** Phase 1 (catalog) shipped — `docs/superpowers/specs/2026-07-24-merch-shop-printful-design.md` + `...-phase-1.md`. Live on `main` (#479, #480).

## Summary

Turn the browsable catalog into a real store: a client-side **cart**, an
address step, live **Printful shipping rates**, **hosted Stripe Checkout** with
`automatic_tax`, and a webhook that **auto-creates the Printful order** and emails
a confirmation. Scoped to **Printful (print-on-demand)** products — the only
source that exists today.

The order model is built **fulfillment-type-aware** so that Phase 3 (non-Printful
products: self-shipped / pickup / digital, with an admin product CRUD) bolts on as
pure additions — no checkout rework, no enum-ALTER migration.

## Goals / Non-goals

**Goals**
- Client-side cart (add/remove, quantity per variant).
- Guest-friendly checkout (no forced account).
- Address-first flow → live Printful shipping rate → hosted Stripe Checkout with `automatic_tax`.
- On payment: auto-create the Printful order, mark the order submitted, email a confirmation.
- A thank-you page a guest can view via the Stripe `session_id`.

**Non-goals (Phase 3, separate spec)**
- Non-Printful product sources (self-shipped, pickup, digital) and mixed carts.
- An admin UI to create products by hand.
- Inventory tracking, discounts/promo codes on merch, order management/refund UI.
- Printful shipped-status webhook + tracking email (optional later add).

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Phase order | Printful checkout now; non-Printful = Phase 3 | Ships revenue soonest; order model made extensible so Phase 3 is additive. |
| Phase-3 seam | `fulfillment_type` enum with **all 4 values** now (`printful_pod`, `self_shipped`, `pickup`, `digital`); stamped per order line; webhook uses a **dispatcher** | Postgres enum-value adds need their own migration; defining all values now avoids that. Only `printful_pod` is implemented. |
| Checkout | Hosted Stripe Checkout Session (`mode=payment`) | Native shipping + tax; matches drop-in/rental pattern (Phase 1 decision). |
| Shipping | Live Printful rates → address collected on-site before session creation | Accurate POD shipping (Phase 1 decision). |
| Sales tax | `automatic_tax` **always enabled**; merch line items carry a **tangible-goods tax code** | Owner completed the Ohio Stripe Tax registration (status: collecting). Goods tax code (not the account's "General - Services" default) classifies merch correctly. |
| Fulfillment | Auto-create Printful order on payment (`confirm:true`) via webhook | Hands-off (Phase 1 decision). |
| Order financials | In `merch_orders`, not the registration `payments` table | Keeps registration revenue reporting clean (Phase 1 decision). |
| Thank-you access | Look the order up by the Stripe `session_id` Stripe appends on redirect | Secure guest access without inventing a separate token. |

## Hard prerequisites (owner)

- **Stripe Tax active + Ohio registration collecting** — DONE (dashboard shows Ohio "collecting"). Required because `automatic_tax` is always on; without it, session creation errors.
- **`MESSAGING_LIVE=yes`** (prod Netlify) for the confirmation email to actually send; otherwise it's mock-logged (Phase 1 messaging gate).

## Data model (new tables, org-scoped)

```
merch_fulfillment_type  ENUM ('printful_pod', 'self_shipped', 'pickup', 'digital')
merch_order_status      ENUM ('pending','paid','submitted','shipped','cancelled','failed')

merch_orders
  id                uuid pk
  organization_id   uuid  -> organizations (cascade)
  user_id           uuid  -> users (guest-upserted; not null)
  email             varchar
  status            merch_order_status  default 'pending'
  stripe_checkout_session_id  varchar unique (nullable until created)
  stripe_payment_intent_id    varchar unique (nullable)
  printful_order_id varchar (nullable)
  shipping_address  jsonb          -- {name,address1,address2,city,state,zip,country}
  subtotal_cents    integer
  shipping_cents    integer
  tax_cents         integer default 0   -- filled from the Stripe session on completion
  total_cents       integer
  currency          varchar default 'usd'
  created_at / updated_at

merch_order_items
  id                uuid pk
  order_id          uuid  -> merch_orders (cascade)
  merch_variant_id  uuid  -> merch_variants (restrict)  -- keep the catalog row referenceable
  fulfillment_type  merch_fulfillment_type default 'printful_pod'
  -- snapshot (survives later catalog edits):
  product_name      varchar
  variant_name      varchar
  size / color      varchar (nullable)
  printful_sync_variant_id  varchar   -- what the Printful order needs
  unit_price_cents  integer
  quantity          integer
```

Migration via `db:generate` (committed). Status transitions: `pending → paid`
(webhook) `→ submitted` (Printful order created) `→ shipped` (optional later).
`failed`/`cancelled` for payment or fulfillment failure.

## Cart

Client-side only (localStorage), a React island:
- shape: `{ variantId, productSlug, name, size, color, unitPriceCents, imageUrl, qty }[]`
- add-to-cart on the product-detail page (replaces the Phase-1 "ordering opens soon" note), a cart drawer/badge, quantity edit, remove.
- No server cart table. The server **re-prices and re-validates** every line at quote/checkout time (never trusts client prices).

## Printful client additions — `src/lib/printful/client.ts`

- `calculateShipping(recipient, items): PrintfulShippingRate[]` — POST `/shipping/rates`.
- `createOrder(payload, { confirm: true }): { id }` — POST `/orders`.
- `getOrder(id)` — GET `/orders/{id}` (status lookups; used later).

All server-side. Reuse the existing `pfGet`/error classes; add a `pfPost` helper.

## Checkout & fulfillment flow

1. Cart → `/shop/checkout` (SSR page + island): collect shipping address (name, street, city, state, zip, country).
2. **`POST /api/merch/quote`** (guest-allowed, rate-limited): validate cart items + re-price from DB, call Printful `calculateShipping`, return `{ items, subtotalCents, shippingCents, currency }`. (Tax is computed by Stripe at checkout, not here.)
3. **`POST /api/merch/checkout`** (guest-allowed, rate-limited): `upsertGuestUser(email)`, insert `merch_orders(pending)` + `merch_order_items`, create a Stripe Checkout Session:
   - `mode: 'payment'`, `customer_email`
   - `line_items` from the cart, each with `price_data` (product name, unit amount) and a **tangible-goods `tax_code`**
   - one `shipping_options` entry = the computed Printful rate (fixed amount)
   - `automatic_tax: { enabled: true }`
   - `shipping_address_collection` restricted to allowed countries (address already captured; Stripe re-confirms)
   - `metadata: { type: 'merch_order', orderId }`
   - `success_url` = `/shop/order?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` = `/shop/checkout`
   Store `stripe_checkout_session_id` on the order; return the session URL → redirect.
4. Buyer pays on Stripe's hosted page.
5. **Webhook** `checkout.session.completed` with `metadata.type === 'merch_order'` (in the existing `handle-stripe-event.ts` `dispatch()`; idempotent via `stripe_events`):
   - mark order `paid`; store `stripe_payment_intent_id` and `tax_cents`/`total_cents` from the session (`total_details.amount_tax`, `amount_total`).
   - **fulfillment dispatcher** switches on the order's line `fulfillment_type`:
     - `printful_pod`: call Printful `createOrder({ recipient: shipping_address, items: [{ sync_variant_id, quantity }], shipping: <rate id> }, { confirm: true })`, store `printful_order_id`, set `submitted`.
     - other types: **not implemented in Phase 2** — the dispatcher throws `UnsupportedFulfillment` if encountered (can't happen yet; guards Phase 3).
   - send the confirmation email (Resend, `MESSAGING_LIVE`-gated).
6. **Thank-you page** `/shop/order?session_id=...`: server retrieves the Stripe session, finds the order by `stripe_checkout_session_id`, shows items + totals + status. Only someone with the `session_id` (which Stripe gave the buyer) can view it.

## Error handling

- Quote/checkout endpoints: IP rate-limit (mirror `guest-checkout`), Zod-validate cart + address, re-price server-side.
- **Fulfillment failure is money-safe:** if `createOrder` fails after payment, the order stays `paid` (not `submitted`), the error is logged with the order id, and it surfaces for retry. **Never** silently drop — payment is already captured. (Phase 3/admin adds a retry button; Phase 2 logs + leaves it `paid`.)
- Webhook idempotency via the existing `stripe_events` ledger; safe on Stripe retries.
- Printful client: typed errors, timeouts.

## Reuse (no changes needed)

- Hosted Checkout Session pattern (drop-ins/rentals), the platform vs. Connect payment-config resolution.
- Webhook pipeline `webhooks/stripe.ts` → `handle-stripe-event.ts` `dispatch()` + `stripe_events` idempotency ledger — add one `metadata.type === 'merch_order'` branch.
- `upsertGuestUser` (satisfies the `user_id` requirement for guests).
- Resend email (`MESSAGING_LIVE` gate), BaseLayout, UI primitives, middleware org resolution, Phase-1 catalog read helpers.

## Testing

- **Unit:** cart total math; Printful shipping-rate + order payload mapping (mocked); the tangible-goods `tax_code` is applied to line items.
- **API:** `quote` and `checkout` endpoints (mock Printful + Stripe) — including guest path and server-side re-pricing (client price ignored).
- **Webhook:** the `merch_order` branch — `paid` → Printful `createOrder` called with the right payload → `submitted`; and the money-safe failure path (createOrder throws → stays `paid`, not dropped).
- **E2E:** deferred — needs live Stripe + Printful (consistent with existing Stripe-dependent gaps).

## Phasing within Phase 2 (for the plan)

1. Schema (`merch_orders`, `merch_order_items`, enums) + migration.
2. Printful client `pfPost` + `calculateShipping` / `createOrder` / `getOrder` + payload mappers (pure, TDD).
3. Cart island + add-to-cart on product detail.
4. `/api/merch/quote`.
5. `/api/merch/checkout` (Stripe session, tax code, metadata).
6. Webhook `merch_order` branch + fulfillment dispatcher + confirmation email.
7. `/shop/checkout` address page + `/shop/order` thank-you page.

Each is an independently testable task in the implementation plan.
