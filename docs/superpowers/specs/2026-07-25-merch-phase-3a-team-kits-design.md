# Merch Shop — Phase 3a Design: Team Kit Ordering

**Date:** 2026-07-25
**Branch:** `feat/merch-phase3-team-kits`
**Status:** Approved design — pending spec review
**Predecessors:** Phase 1 (catalog) + Phase 2 (Printful buy-flow) shipped and live. This is the first non-Printful source, built on Phase 2's `fulfillment_type` enum + webhook dispatcher seam.

## Summary

Let the org sell **team kit** (jerseys, shorts, etc.) to a team's players via a
**shareable link**, within a **time-boxed order window**, with **optional per-player
name/number** personalization. These products are **self-fulfilled** (the org places a
bulk order with a supplier off-platform) and **picked up / handed out** (no shipping).
The platform's job: collect + aggregate the orders so the org can place one bulk order
and hand them out.

This also **generalizes the product model** (source + nullable Printful ids +
fulfillment type at the product level), which is the reusable foundation for any future
non-Printful product (generic self-shipped, digital, etc.).

## Goals / Non-goals

**Goals**
- Admin creates a team "kit" (a team + order window + pickup location + a share link) and adds products to it (jersey, shorts…) with sizes, price, and optional name/number personalization.
- A player/parent opens the share link (no sign-in), orders + pays for their own items (choosing size, entering name/number where required), during the window.
- Pickup checkout: **no shipping / no address**, tax computed on the org's Ohio location.
- On payment: no external fulfillment call — the order is marked "awaiting pickup" and a pickup confirmation email is sent.
- Admin sees an **aggregated report** per kit (size breakdown + every name/number + buyer), can export it (to place the bulk order), and mark items collected.

**Non-goals (later)**
- Captain/coach **bulk** purchase of a whole team's set (3a is individual buyers only).
- **Bundled** kits (3a models each item as its own product; a "kit" is the set of products under one team kit).
- Roster-linked ordering / auto-filled name+number (3a uses a share link + typed name/number).
- Generic self-shipped merch, digital goods (the model generalization enables them; the flows aren't built here).
- Full mixed-cart shipping optimization beyond the simple rule below.

## Key decisions

| Decision | Choice |
|---|---|
| First non-Printful use case | Team kits (jerseys) — self-fulfilled + pickup + personalized + team-scoped |
| Access | Shareable per-kit link (`/kit/<token>`), no sign-in |
| Order window | Time-boxed (opens_at / closes_at) per kit |
| Personalization | Optional per-product: collect name and/or number, captured per order line |
| Kit shape | Individual products grouped under a team kit (no bundles) |
| Buyer | Individual players/parents only (captain bulk deferred) |
| Fulfillment | `pickup` — no Printful, no shipping; org fulfills off-platform |
| Tax | Stripe `automatic_tax` on the org's Ohio origin location (no ship-to address) |
| Product model | Generalized: `source` (`printful`\|`manual`), nullable Printful ids, product-level `fulfillment_type` |

## Data model

**New enum**
- `merch_product_source` = (`printful`, `manual`).

**New table `merch_team_kits`** — the team's kit "campaign" (owns window, link, pickup):
- `id`, `organization_id` → organizations (cascade), `team_id` → teams (cascade)
- `name` (e.g. "Fall 2026 Kit"), `share_token` varchar unique
- `order_opens_at`, `order_closes_at` (timestamps; the window)
- `pickup_location` text (shown to buyers + in the email)
- `active` boolean, timestamps

**Alter `merch_products`** (generalization — all additive, Printful rows unaffected):
- `printful_sync_product_id` → **nullable** (was NOT NULL)
- add `source` `merch_product_source` NOT NULL default `printful`
- add `fulfillment_type` `merch_fulfillment_type` NOT NULL default `printful_pod`
- add `kit_id` uuid nullable → `merch_team_kits` (cascade) (null = general/Printful merch)
- add `personalization` jsonb nullable — `{ name?: boolean; number?: boolean }` (null = none)

**Alter `merch_variants`**
- `printful_sync_variant_id`, `printful_variant_id` → **nullable** (manual variants have no Printful ids; size/color/sku/price are admin-entered)

**Alter `merch_order_items`**
- `printful_sync_variant_id` → **nullable**
- add `personalization` jsonb nullable — `{ name?: string; number?: string }` (captured at checkout)

**Alter `merch_order_status` enum** — add `awaiting_pickup`, `collected`.
(Postgres enum-value adds must be their **own migration**, separate from the tables/columns migration — repo convention, error 55P04 otherwise.)

> Backfill: existing `merch_products`/`merch_variants` rows are `source='printful'`, `fulfillment_type='printful_pod'`, `kit_id=null` — the Hoodie flow is unchanged.

## Ordering flow (share link → pickup checkout)

1. **`/kit/[token]`** (public SSR, no sign-in) — resolve `share_token` → the kit + its active products.
   - Window closed (now < opens_at or now > closes_at) → show "Ordering is closed" (+ the window dates); no add-to-cart.
   - Open → list products; each shows size options, price, and **name/number inputs** when `personalization` requires them.
2. **Cart** — reuse the client cart; kit line items carry their `personalization` ({name, number}) and are tagged `fulfillmentType: "pickup"`.
3. **`POST /api/merch/quote`** — partition items by fulfillment type: `pickup` items contribute **$0 shipping** and need no address; `printful_pod` items keep the live-rate path. Address is required **only if** the cart contains shippable (printful) items.
4. **`POST /api/merch/checkout`** — for a pickup-only cart: create the Stripe session with **no `shipping_address_collection`**, `automatic_tax` on, and the customer location set to the **org's Ohio address** (so tax computes) — mirroring the Customer-address approach from Phase 2. Personalization is persisted on `merch_order_items`. `metadata.type = "merch_order"` as before.
5. Buyer pays → thank-you page (shows "pick up at <location>").

**Personalization validation** (server-authoritative): if a product requires name/number, the checkout rejects (422) lines missing them — never trust the client.

## Fulfillment (webhook `pickup` branch)

The dispatcher (`fulfillMerchOrder`) currently throws on non-`printful_pod`. Extend it to **branch per item fulfillment type**:
- `printful_pod` items → create the Printful order (existing).
- `pickup` items → **no external call**; leave them for the org to fulfill.

Order status: kit orders are pickup-only in practice, so the order flows `pending → paid → awaiting_pickup`, then `collected` when the admin hands it out. (A genuinely mixed order — pickup + printful — sets `awaiting_pickup` and still creates the Printful order for its printful items; item-level fulfillment tracking is a later refinement.)

**Pickup confirmation email** (distinct from the Printful shipped email): "Your `<team>` kit is ordered. Pick it up at `<pickup_location>` — we'll let you know when it's ready." Respects the messaging gate.

## Admin

Under the existing `/admin/merch` area:

**1. Kit management** (`/admin/merch/kits`):
- Create/edit a `merch_team_kits`: pick a team, name, window (opens/closes), pickup location; a `share_token` is generated; copyable share link.
- Add/edit **products** within a kit: name, images, price, size variants (admin-entered — no Printful), and personalization toggles (name / number).

**2. Order aggregation** (`/admin/merch/kits/[id]/orders`):
- Every order line for the kit: product, size, **name/number**, buyer email, paid date, collected status.
- A **size/qty summary** per product (what to order from the supplier).
- **Export CSV** (to place the bulk order).
- **Mark collected** (per order or bulk) → sets `collected`.

## Reuse vs. net-new

**Reuse:** `merch_orders`/`merch_order_items`, `fulfillment_type` enum + webhook dispatcher, the client cart, Stripe hosted Checkout + tax (Customer-address pattern), `upsertGuestUser`, Resend, `/admin/merch` shell, catalog helpers.

**Net-new:** the `merch_team_kits` table + product-model generalization; personalization capture/validation; the `/kit/[token]` ordering page + window gating; pickup checkout (address-skip + Ohio-location tax + fulfillment-type partition); the webhook `pickup` branch + pickup email + `awaiting_pickup`/`collected` statuses; admin kit-CRUD + aggregation/export/collect.

## Testing

- **Unit:** window open/closed logic; personalization required-field validation; cart partition by fulfillment type; pickup tax-location selection; CSV/aggregation shaping.
- **API:** `/kit/[token]` data (open vs closed), pickup `quote`/`checkout` (no address, personalization required), admin kit CRUD auth.
- **Webhook:** the `pickup` branch — paid → `awaiting_pickup`, no Printful call, email sent; and a mixed order still creates the Printful order.
- **E2E:** deferred (needs Stripe + a seeded kit).

## Owner actions / prerequisites

- None new for infra — reuses the live Stripe + Ohio Stripe Tax. (Pickup tax uses the same Ohio registration.)
- Per kit: the org creates the kit + products and shares the link.

## Phasing within 3a (for the implementation plan)

1. **Schema** — product-model generalization + `merch_team_kits` + personalization columns + status enum values (two migrations: tables/columns, then the enum-value add).
2. **Admin kit CRUD** — create/edit kits + their products (+ share-token generation).
3. **Ordering page** — `/kit/[token]` + window gating + personalization inputs + add-to-cart.
4. **Pickup checkout + fulfillment** — quote/checkout fulfillment-type partition (address-skip, Ohio tax), personalization persistence/validation, webhook `pickup` branch, pickup email, `awaiting_pickup` status.
5. **Admin aggregation** — per-kit order report + size summary + CSV export + mark-collected.

Each is an independently testable slice.
