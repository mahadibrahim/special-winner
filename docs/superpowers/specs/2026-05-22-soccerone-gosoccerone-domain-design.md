# SoccerOne on gosoccerone.com — Design Spec

**Date:** 2026-05-22
**Status:** Design — awaiting founder review
**Author:** Aspire Sports Engineering
**Topic:** Serve the SoccerOne marketing brand at `www.gosoccerone.com`, backed by the existing Aspire platform.

---

## 1. Context & Goal

SoccerOne is a partner-facility brand (the indoor facility chain: Downtown + Worthington). A marketing prototype already exists in this repo under `src/pages/soccerone/*` and `src/components/soccerone/*` — a self-contained, dark-themed brand skin with its own `SoccerOneHeader`/`SoccerOneFooter` (it uses `BaseLayout` with `navigation={false} footer={false}`).

**Goal:** `www.gosoccerone.com` serves the SoccerOne marketing site, backed by the **same** Aspire platform — same database, same admin, same Stripe — so bookings made from gosoccerone.com land in the shared system. The Aspire site, which is live shortly, must not regress.

**Non-goal:** moving Aspire onto its own separate domain or codebase. Aspire is unchanged except for the explicitly-scoped shared-code edits below.

## 2. Approach

The Aspire platform is already **multi-tenant and domain-routed**: `src/middleware.ts` runs `resolveOrganizationFromHost()` on every request, and the `domain_mappings` table maps any hostname to an organization. Serving a second brand on its own domain is what this architecture exists for.

**Chosen approach: one app, multi-domain.** `gosoccerone.com` becomes a domain alias on the same Netlify site; SoccerOne is a separate **tenant organization**. Booking, Stripe, DB, and admin are shared because it is literally the same app.

**Rejected: a separate marketing repo/site calling the platform via API.** It fails the core requirement ("connects to the same booking system"): you would either bounce users to a second domain at the checkout step (brand break at the worst moment; session cookies do not cross domains) or rebuild the entire registration/checkout/auth stack against an API. Massive duplication, fights the architecture.

## 3. Tenant model

- A new `organizations` row for SoccerOne. **It must be created as a non-`headquarters` org type** — see Risk R-VERIFIED-1.
- SoccerOne's `locations` (Downtown, Worthington) and field `venues`.
- Two `domain_mappings` rows — `gosoccerone.com` and `www.gosoccerone.com` — both pointing at the SoccerOne org. `www.gosoccerone.com` is the canonical/primary domain; apex `gosoccerone.com` 301-redirects to it.
- SoccerOne's programs, field-rental rate cards, drop-in sessions, and membership tiers are created via admin or a branch-scoped seed script — a **data precondition**, tracked in §10.

## 4. Governing safety principle: additive gating

**For any non-SoccerOne request, the executed code path must be functionally identical to today.** Every SoccerOne-specific branch's `else` is the untouched present behavior. SoccerOne logic is additive and gated; it never rewrites an Aspire path. This is a non-negotiable constraint on every shared-code edit in Phases 0–3, and code review must enforce it.

## 5. Phase 0 — Public API tenant-scoping (PREREQUISITE)

### 5.1 The finding

An audit of the public API (2026-05-22) found that **the public API layer has no organization dimension.** It was built single-org. Three high-traffic read endpoints query across *every active org*, not the resolved one. With one org this is invisible; with a second active org, both sites cross-contaminate — Aspire's `/programs`, `/events`, `/sports`, `/locations` would list SoccerOne content, and vice versa.

This is the single regression vector that lives *outside* the SoccerOne diff: it is triggered simply by the SoccerOne org existing. **Phase 0 must land and be verified before the SoccerOne org row is ever inserted.**

### 5.2 Endpoints to fix

| Endpoint / module | Current state | Required change |
|---|---|---|
| `src/pages/api/public/seasons.ts` | `async ({ url })`, no `locals`; only filter is `organizations.status='active'` | Add `locals`; filter by `locals.organization.id`; fail closed (empty) if no org |
| `src/pages/api/public/seasons/[id].ts` | `async ({ params })`, no org or status check | Add `locals`; 404 if the season's org ≠ resolved org; also require `organizations.status='active'` |
| `src/pages/api/public/events.ts` | `async ({ url })`, no org filter at all | Add `locals`; filter events by resolved org |
| `src/lib/programs/public-filters.ts` (`getPublicSports`, `getPublicLocations`) | Header comment: "intentionally global (not tenant-scoped)" | Add a required `orgId` parameter; filter both queries by it |
| `src/pages/api/public/filters.ts` | `async ()`, no `locals` | Add `locals`; pass `locals.organization.id` to the helpers |
| `src/pages/api/public/corporate-inquiry.ts` | `POST ({ request, clientAddress })`, no org; `corporate_inquiries` has no org column | Add a nullable `organization_id` column (additive migration); add `locals`; write it |
| `src/pages/api/public/newsletter.ts` | `POST ({ request, clientAddress })`, no org; `newsletter_signups` has no org column | Add a nullable `organization_id` column (additive migration); add `locals`; write it |
| `src/pages/api/public/team-registrations/[token].ts` | `GET ({ params })`, token-only | Defensive: cross-check the token's org against the resolved org |

Already correct (no change): `validate-discount.ts` and `team-registrations` POST — both require `locals.organization` and filter/write by `organizationId`. They are the reference pattern.

### 5.3 Consumers

Read endpoints scope server-side from `locals` (set by middleware from the request host), so **HTTP consumers need no change** — `fetch('/api/public/seasons')` from either domain automatically gets scoped results. The only consumer edits: the `/sports` and `/locations` index pages call `getPublicSports/Locations` *directly* in Astro frontmatter — they must pass `Astro.locals.organization.id`.

### 5.4 Mock-data fallback cleanup

`seasons.ts` falls back to hardcoded `mockSeasons` ("Powell" data) when the query returns zero rows. In a two-tenant system an org with an empty catalog must render an empty state, not another org's mock data. Remove the mock fallback (or gate it strictly to dev) as part of Phase 0.

### 5.5 Why Phase 0 is safe

It is a **zero-behavior-change refactor while there is one org.** Adding `WHERE organizationId = <resolved org>` produces an identical result set today, because every row already belongs to the only org. Phase 0 can therefore be built, shipped to the live Aspire site, and verified green **before SoccerOne exists** — nothing observable changes on Aspire.

The two write endpoints additionally need a nullable `organization_id` column on `newsletter_signups` and `corporate_inquiries` — an additive, forward-compatible migration that is likewise unobservable on the live Aspire site (a new nullable column, written only on new rows).

### 5.6 Acceptance

- All endpoints in §5.2 read/write the resolved org.
- Endpoints fail closed (empty list / 400) when `locals.organization` is null.
- Aspire E2E suite green; manual check: Aspire `/programs`, `/events`, `/sports`, `/locations` unchanged.

## 6. Phase 1 — Domain plumbing

**1a. Org + domain mappings.** Create the SoccerOne org, locations, and venues; insert the two `domain_mappings` rows.

**1b. Middleware host-rewrite** (`src/middleware.ts`). Immediately after org resolution (≈ line 85), when the resolved org is SoccerOne, rewrite a fixed allowlist of marketing-root paths into the `soccerone/*` subtree via `context.rewrite()`:

| Requested path (SoccerOne host) | Rewritten to |
|---|---|
| `/` | `/soccerone` |
| `/leagues` | `/soccerone/leagues` |
| `/rent` | `/soccerone/rent` |
| `/pickup` | `/soccerone/pickup` |
| `/memberships` | `/soccerone/memberships` |
| `/downtown` | `/soccerone/downtown` |
| `/worthington` | `/soccerone/worthington` |

Any path not in the table — shared routes (`/register`, `/rentals`, `/dropin`, `/signin`, `/dashboard`), `/api/*`, static assets — is **not** rewritten and serves normally (org-scoped by the resolver). The rewrite is gated on the resolved org being SoccerOne (by org `slug === 'soccerone'`); for any other org the middleware path is unchanged.

**1c. Reverse guard.** On the Aspire domain, `/soccerone/*` requests 301-redirect to the canonical `https://www.gosoccerone.com/<mapped path>` — avoids a duplicate-content SEO split. The `soccerone/*` page files remain as the rewrite target but are not a public surface on the Aspire domain.

**1d. Prerender.** `soccerone/index.astro` is currently `prerender = true`; a request-time middleware rewrite to a static page is fragile. Flip the rewritten marketing pages to SSR (`prerender = false`). They are cheap to server-render. (`leagues.astro` is already SSR.)

**1e. Netlify + DNS.** Add `gosoccerone.com` + `www.gosoccerone.com` as domain aliases on the production Netlify site; www canonical; auto-SSL. DNS at the registrar points to Netlify. **Staging path:** test end-to-end via `soccerone.aspiresports.com` first — `resolveBySubdomain()` matches the org by slug, so no `domain_mappings` row is needed for that subdomain. Cut over real DNS only after the subdomain test passes.

**1f. Per-brand analytics.** `BaseLayout` injects GTM. Select the GTM container by resolved org; Aspire's container is the default branch (byte-identical to today).

## 7. Phase 2 — Wire the three live booking primitives

The `soccerone/*` pages are mockups with demo links today. Three of the four advertised products have a working backend; point their CTAs at the real, org-scoped flows. **Phase 2 edits only `soccerone/*` files and calls existing endpoints — it touches no Aspire-shared code.**

- **Leagues** (`leagues.astro`): replace mock league cards with live data from `/api/public/seasons` (now SoccerOne-scoped via Phase 0); CTAs → `/register` / the team-registration flow.
- **Rent** (`rent.astro` + `FieldCalendar.tsx`): wire `FieldCalendar` to `/api/rentals/availability` + `/api/rentals/bookings`. The existing conditional-Connect pattern (`venue.partnerStripeAccountId` → destination charge + `application_fee`) routes money to the facility account.
- **Pickup** (`pickup.astro` + `PickupGames.tsx`): wire to `/api/dropin/sessions` + `/api/dropin/bookings`.
- Remove hardcoded mock data from the three pages and their React components.

**Precondition (ops):** SoccerOne's programs, venues + `field_rental_rate_card`, drop-in sessions + rate cards, and the facility's onboarded Stripe Connect account (`partnerStripeAccountId` set on its venues) must exist. Tracked in §10.

## 8. Phase 3 — Membership subsystem

`memberships.astro` markets a product with **no backend** — confirmed in `drop-in.ts:129` (`// the memberships table does not exist yet`). Phase 3 builds it, per `docs/design/2026-04-28-soccerone-data-model.md`, adapted to current schema.

- **Schema** — new `src/lib/db/schema/memberships.ts`:
  - `membershipTiers` (org-scoped): name, monthly/annual price cents, `benefits` JSONB, Stripe price IDs, display order, active flag.
  - `memberships` (user × tier): status, billing interval, `currentPeriodEnd`, pause fields, `stripeSubscriptionId`, `stripeCustomerId`.
  - Drizzle migration generated via `db:generate`, reviewed, committed. New tables are additive/forward-compatible. The existing soft `dropInBookings.membershipId` reference **stays soft** (no FK) to minimize blast radius on a shared table.
- **Stripe** — Subscriptions over Connect, mirroring the rentals conditional-Connect pattern (`transfer_data.destination` + `application_fee_percent`, direct-charge fallback). The connected account is sourced at org level (memberships are org-scoped, unlike venue-scoped rentals).
- **Endpoints** — `/api/memberships/subscribe`, `/api/memberships/cancel`, `/api/memberships/pause`.
- **Webhook** — subscription lifecycle (`customer.subscription.created/updated/deleted`, `invoice.payment_failed`) → sync `memberships.status` + `currentPeriodEnd`. **Added as new `case` branches in the existing `stripe-connect.ts` webhook** (separate from Aspire's primary `stripe.ts` PaymentIntent webhook); existing cases are not touched.
- **Member benefits** — at rental/drop-in checkout creation, look up the user's active SoccerOne membership and apply `benefits.rental_discount_pct`. This edits shared checkout code (Risk R4): the lookup is **gated on the org having membership tiers** — false for Aspire → exact current code path — and must not throw for membership-less users.
- **Customer dashboard** — a membership card (tier, status, renewal date, pause/cancel actions) in the existing dual-persona dashboard, rendered only when the user has a membership.
- **`memberships.astro`** — swap mock tiers for live `membershipTiers`; CTA → `/api/memberships/subscribe`.

## 9. Risk register — regression exposure to the live Aspire site

Severity is residual (after the stated mitigation). The governing mitigation throughout is §4 additive gating.

| ID | Shared surface | Phase | Inherent | Residual | Mitigation |
|---|---|---|---|---|---|
| R-VERIFIED-1 | Default-org resolution | 1 | — | **None** | `resolveDefaultOrganization()` already orders by `createdAt asc` and prefers the HQ org. Adding a newer, non-HQ SoccerOne org cannot flip Aspire's resolution. **Constraint: create SoccerOne as a non-`headquarters` org type.** |
| R0 | Public API tenant-scoping | 0 | High | Low | Phase 0. Zero-behavior-change at one org; ship and verify before SoccerOne exists. |
| R1 | `src/middleware.ts` host-rewrite | 1 | High | Low–Med | Runs on every Aspire request. Gate strictly on resolved org = SoccerOne; Aspire hits an early return identical to today. Unit-test the rewrite table. |
| R2 | `BaseLayout.astro` per-brand GTM | 1 | Med | Low | Aspire = default branch, byte-identical; branch only for SoccerOne. |
| R3 | Netlify aliases / redirects | 1 | Low–Med | Low | Additive aliases are safe; host-scope every new redirect rule; do not change Aspire's primary domain. |
| R4 | Member discount in shared rental/drop-in checkout | 3 | High | Med | Gate the membership lookup on "org has membership tiers" — false for Aspire → exact current path. Lookup must not throw for membership-less users. Heavy tests. |
| R5 | Stripe webhook additions | 3 | High | Med | Subscription events land in the separate `stripe-connect.ts` webhook, not Aspire's primary `stripe.ts`. Additive `case` branches only. |
| R6 | Customer dashboard membership card | 3 | Med | Low | Additive component, rendered only when the user has a membership. |
| R7 | `drop_in.ts` `membershipId` | 3 | Low–Med | Low | Keep the reference soft (no FK). |
| R8 | New migration / `migrate-prod.yml` | 0, 3 | Med | Low | Additive tables/columns; idempotent migration; `db:generate` + review; staging run first. |
| R9 | Shared deploy pipeline | All | Med | Low–Med | Every SoccerOne merge ships Aspire from the same `main`/build/migrate. CI-green gate, staging verification, pre-push checklist; worktree for the multi-phase work. |

Minor: `resolveBySubdomain()` has a `.limit(1)` location lookup without `orderBy` — only bites if SoccerOne and Aspire share a location slug *and* subdomain routing is used. Avoid slug collisions.

## 10. Data preconditions (ops, not code)

- SoccerOne organization, locations, venues created (org type ≠ `headquarters`).
- SoccerOne programs/seasons for the leagues page.
- `field_rental_rate_card` + drop-in sessions/rate cards for rent/pickup.
- Facility Stripe Connect account onboarded; `partnerStripeAccountId` set on SoccerOne venues.
- Membership Stripe Prices created per tier (Phase 3).

## 11. Data flow (end to end)

Request host → middleware `resolveOrganizationFromHost()` → `locals.organization` = SoccerOne → middleware rewrites a marketing-root path into `soccerone/*` → SoccerOne-branded page renders → CTA → shared, org-scoped booking/checkout endpoint → Stripe (Connect destination charge to the facility account) → webhook → DB row → surfaces in the shared admin and the customer dashboard.

## 12. Error handling

- **Unmapped `gosoccerone.com`** (DNS live, `domain_mappings` row missing) must not silently serve Aspire content — the resolver's default fallback would return Aspire. Add a guard: if the host is a known SoccerOne domain but resolves to a non-SoccerOne org, log and serve a holding page / 404 rather than Aspire content.
- **Unknown path on the SoccerOne host** — not in the rewrite table → falls through to normal routing → 404.
- **Public API with no org context** — fail closed (empty list / 400), never fall back to a global query.
- **Stripe failures** — follow existing patterns (the rentals endpoint already deletes the hold row on checkout-create failure; memberships do likewise).

## 13. Testing strategy

- **Unit** (`tests/unit/`): the middleware host→path rewrite table; the Phase 0 org-filter helpers.
- **API** (`tests/api/`): every Phase 0 endpoint returns only the resolved org's rows; membership subscribe/cancel/pause; member-discount application in rental/drop-in checkout.
- **E2E** (`tests/e2e/`): SoccerOne marketing renders on the SoccerOne host (via the `soccerone.aspiresports.com` subdomain or a `Host`-header override); one booking flow per primitive; membership subscribe. Plus a regression check that Aspire `/programs`, `/events`, `/sports`, `/locations` show only Aspire content with both orgs present.
- **Webhook**: subscription lifecycle events sync membership status.
- Cross-tenant assertion: with both orgs seeded, no Aspire surface shows SoccerOne data and vice versa.

## 14. Sequencing & shippability

Four phases, each independently shippable, each its own implementation plan and PR:

1. **Phase 0** — public API tenant-scoping. Ships to live Aspire with no observable change. **Hard gate: verified green before Phase 1.**
2. **Phase 1** — domain plumbing. gosoccerone.com serves the marketing site.
3. **Phase 2** — wire leagues/rent/pickup. Bookings live.
4. **Phase 3** — membership subsystem. Memberships live. (Phase 3 modifies Phase 2's checkout code for member discounts.)

The SoccerOne org row must not be created until Phase 0 is merged and verified.

## 15. Out of scope (YAGNI)

- Moving Aspire to its own separate domain or codebase.
- Season-long / recurring block bookings; recurring rentals.
- Group split-pay.
- Member messaging / pickup group chat.
- A generalized "any number of brands" framework — the rewrite uses an explicit table for one extra brand; generalize only when a third brand appears.

## 16. Open questions

- None. (`events` has a direct `organization_id` column — confirmed 2026-05-22.)
