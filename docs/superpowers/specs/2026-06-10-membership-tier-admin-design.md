# Membership Tier Admin — Design Spec

**Date:** 2026-06-10
**Status:** Approved for planning
**Author:** Founder + Claude

## Problem

Membership tiers (`membership_tiers`) are the only priced product in the app with **no admin interface**. Programs, drop-in sessions, and field rentals are all configured through `/admin/*` pages; membership tiers are created by hand-written SQL plus manually-created Stripe Prices (see `docs/ops/soccerone-launch-checklist.md` §6.5.4). This is error-prone and blocks launch on a manual, two-system ritual:

1. Create recurring Stripe Prices in the live dashboard, copy each `price_…` id.
2. Hand-write an `INSERT INTO membership_tiers …` with those ids.

A tier row without valid Stripe Price ids is broken: `/api/memberships/subscribe` 404s (no tier) or 422s (no price). This spec adds an admin UI that creates the Stripe Prices **and** the tier row in one action, scoped to the active organization.

## Goals

- Admins manage their org's membership tiers entirely through `/admin/memberships/**` — create, edit, activate/deactivate, and reorder by drag-and-drop.
- Creating/editing a tier creates the matching Stripe **Product + recurring Prices** automatically; the admin never touches the Stripe dashboard or SQL.
- Replace the manual launch-checklist step §6.5.4: the founder creates SoccerOne's Member + Founder tiers through this UI in prod.

## Non-goals

- No migration of existing subscribers to new prices. Price edits **grandfather** existing subscribers (Stripe default); only new signups get the new price.
- No Stripe Connect path. Per the one-shared-account decision (`memory: project_one-stripe-account-brand-attribution`), Products/Prices are created on the **platform account** with no `Stripe-Account` header.
- No Day Pass / one-time membership product. The subscribe flow is subscription-only (recurring Prices). A Day Pass isn't needed: a non-member simply pays the non-member price for pickup, leagues, or field rentals — there's nothing to subscribe to.
- No public-facing changes. The `/memberships` marketing page and `/api/public/membership-tiers` already read these rows; they need no edits.

## Architecture

Mirrors the existing **branding admin** (`src/pages/admin/branding/**`, `src/pages/api/admin/branding/**`) — the closest CRUD analog (org-scoped, `requireAdminAccess`, list + detail pages, validators module).

### Pages — `src/pages/admin/memberships/`

- `index.astro` — list tiers for the active org, ordered by `displayOrder`, with active/inactive state, prices, and edit links. Empty state when none exist. Rows are **drag-and-drop reorderable**, reusing the native HTML5 drag pattern already in `src/components/admin/waitlist-manager.tsx` (no new dependency); a drop persists the new order via the reorder endpoint below.
- `new.astro` — create form.
- `[id].astro` — edit form.
- A React `TierForm` component (`src/components/admin/memberships/tier-form.tsx`) drives both create and edit (`react-hook-form` + `zod`, per repo convention). Uses `useHydrationBeacon()` if it becomes e2e-driven.

### API — `src/pages/api/admin/memberships/tiers/`

- `index.ts`
  - `GET` → list tiers for `locals.organization.id`, ordered by `displayOrder`.
  - `POST` → create a tier (see lifecycle below).
- `[id].ts`
  - `GET` → fetch one tier (org-scoped).
  - `PUT` → edit a tier (see lifecycle below).
  - `DELETE` → hard-delete **only** if no `memberships` row references it (including past/cancelled — any history blocks it); otherwise `409` with "deactivate instead." (Confirmed: hard delete is acceptable when no member has ever subscribed.)
- `reorder.ts`
  - `PUT` → accept an ordered array of tier ids for the active org and write their `displayOrder` in one transaction. Mirrors the existing curriculum/sports `sortOrder` reorder endpoints. Rejects ids that don't belong to the active org.

All endpoints: `requireAdminAccess(context)`, then resolve `locals.organization.id`. The `[id]` endpoints **must** verify the tier's `organizationId` matches the active org before any read-back or mutation (tenant-scoped-admin rule in CLAUDE.md). `export const prerender = false`.

### Nav

Add a "Memberships" link to the admin navigation alongside the existing branding / drop-in links.

## Stripe lifecycle — `src/lib/memberships/admin-stripe.ts`

A new module, platform-account only. Split so pure logic is CI-testable without a Stripe key (see Testing).

**Create (`POST`):**
1. Create one Stripe **Product** for the tier (`name` = tier name).
2. For each interval with a non-null amount, create a recurring **Price** (`unit_amount` cents, `currency: usd`, `recurring.interval: month|year`, `product: <productId>`).
3. Insert the `membership_tiers` row with `stripeProductId`, `stripePriceIdMonthly`, `stripePriceIdAnnual`, plus the display fields.
4. Idempotency key per Stripe create, derived from org + tier name + interval + amount, so a double-submit can't duplicate objects.
5. If the DB insert fails after Stripe succeeds, best-effort archive the just-created Price(s) (`prices.update(id, {active:false})`) and return `502`. Orphan Prices are harmless if archival fails (never referenced).

**Edit (`PUT`):**
- **Amount changed** for an interval → create a **new** Price, archive the old (`prices.update(old, {active:false})`), reuse the existing Product, store the new price id. Existing subscribers are untouched and keep billing on their old Price (grandfathered). New signups read the new id off the row.
- **Amount added** (was null, now set) → create a new Price for that interval.
- **Amount removed** (was set, now null) → archive the old Price, null the id. (Validation still requires ≥1 priced interval overall.)
- **Name changed** → `products.update(productId, {name})`.
- **Benefits / displayOrder / isActive changed** → DB-only, no Stripe call.

**Deactivate** (`isActive=false`): DB-only soft-hide. The public-tiers endpoint already filters on `isActive`, so new signups stop seeing it; Prices stay active so existing members keep billing.

### Schema change

Add one column (additive migration via `npm run db:generate`):

```
membership_tiers.stripe_product_id  text   -- nullable; the tier's Stripe Product
```

`stripePriceIdMonthly` / `stripePriceIdAnnual` already exist. The product id gives edits a stable Product to reuse rather than re-deriving it from a Price each time.

## Validation & units

- `name` — required, non-empty.
- **At least one** of monthly/annual price must be set — a priceless tier cannot be subscribed to.
- Benefit values typed: `rental_discount_pct` 0–100; count fields (`free_pickup_per_month`, `guest_passes_per_month`, `booking_window_days`, `priority_league_signup_hrs`) integers ≥ 0; boolean fields (`unlimited_pickup`, `members_only_pickup`) toggles. Unknown keys preserved on edit (don't clobber future keys).
- **Form takes dollars; the API converts to cents at the boundary** (`memory: feedback_no-backend-conventions-in-ui`). The admin types `$29.00`; storage and Stripe get `2900`.
- Benefits live in the validators module (`src/lib/memberships/validators.ts`) so create + edit share one schema.

## Benefits editor

Structured fields for all 7 keys that drive real behavior (confirmed read in `dropin/pricing.ts`, `memberships/discount.ts`, `rentals/bookings`):

| Key | Control | Drives |
|---|---|---|
| `rental_discount_pct` | number 0–100 | rental checkout discount |
| `unlimited_pickup` | toggle | drop-in pricing |
| `free_pickup_per_month` | number ≥ 0 | drop-in pricing |
| `guest_passes_per_month` | number ≥ 0 | (reserved) |
| `booking_window_days` | number ≥ 0 | booking window |
| `priority_league_signup_hrs` | number ≥ 0 | early league access |
| `members_only_pickup` | toggle | drop-in eligibility |

## Multi-tenant safety

- Every endpoint is `requireAdminAccess` + scoped to `locals.organization.id`.
- `[id]` endpoints load the tier and reject (`404`) if its `organizationId` ≠ active org, before any mutation. An admin of org A can never read or edit org B's tier.
- List/`findFirst` queries carry explicit `orderBy` (CI multi-tenant query-hazard rule).

## Error handling

- Stripe API failure → `502` with a safe message; the DB row is not written (create) or not advanced past the failed interval (edit).
- DB unique/constraint errors surfaced as `409` where meaningful.
- Client: `ErrorBanner` for form/validation failures, `toast.error` for transient save failures (UI feedback primitives).

## Testing

- **Unit (`tests/unit/`, runs in CI, no Stripe key):**
  - dollars↔cents conversion at the boundary.
  - benefits zod validation (bounds, unknown-key preservation).
  - price-diff logic: given old vs new amounts, which intervals need a new Price / an archive / a no-op. This is the brain of the edit path and must be CI-covered — avoids the earlier trap where the only coverage was Stripe-gated and silently skipped.
- **API (`tests/api/`):**
  - tenant scoping: org-A admin gets `404` on org-B tier (GET/PUT/DELETE); reorder rejects ids outside the active org.
  - validation failures: no name, no price, out-of-range benefit.
  - delete: `409` when a membership references the tier, success when none ever did.
  - list returns only the active org's tiers, ordered by `displayOrder`.
  - The thin Stripe-calling create/edit happy-path is `itWithStripe`-gated (consistent with repo convention); its *logic* is already covered by the unit tests above.

## Launch-checklist impact

Once shipped, `docs/ops/soccerone-launch-checklist.md` §6.5.4 changes from "create Stripe Prices in the dashboard + hand-write SQL" to "open `/admin/memberships` on `gosoccerone.com` as a SoccerOne super-admin, create the Member and Founder tiers." The manual SQL block and dashboard steps are deleted.

## Files

**New**
- `src/pages/admin/memberships/{index,new,[id]}.astro`
- `src/components/admin/memberships/tier-form.tsx`
- `src/pages/api/admin/memberships/tiers/{index,[id],reorder}.ts`
- `src/lib/memberships/admin-stripe.ts`
- `src/lib/memberships/validators.ts`
- `tests/unit/memberships/{units,benefits,price-diff}.test.ts`
- `tests/api/admin/membership-tiers.test.ts`
- `src/lib/db/migrations/NNNN_*.sql` (generated — adds `stripe_product_id`)

**Edited**
- `src/lib/db/schema/memberships.ts` (add `stripeProductId`)
- admin nav component (add "Memberships" link)
- `docs/ops/soccerone-launch-checklist.md` (§6.5.4 rewrite)
