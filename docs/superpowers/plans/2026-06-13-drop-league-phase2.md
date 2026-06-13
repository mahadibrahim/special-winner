# The Drop League — Phase 2 Implementation Plan (subscription billing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Drop League subscription billing — **$99/month rolling subscription + $25 one-time registration fee** via Stripe, built on the **existing memberships subscription rails** (do NOT reinvent recurring billing). After this, a registered player can subscribe, the webhook keeps their subscription status in sync, and they can cancel at period end.

**Architecture:** Mirror the memberships flow exactly. `getOrCreateStripeCustomer` + a Drop subscription Checkout Session (`mode: "subscription"`) carrying the **$99/mo recurring price + a $25 one-time price** as two line items, with `metadata.type === "drop_subscription"`. The shared Stripe webhook (`src/lib/stripe/handle-stripe-event.ts`) gains additive Drop routing → new `src/lib/drop-league/webhook-handlers.ts` (mirrors `src/lib/memberships/webhook-handlers.ts`) → syncs a new `drop_subscriptions` table. **The live Stripe Prices are a founder post-merge step** (like membership tiers); the code reads price IDs from env.

**Tech Stack:** Astro 5 SSR, Drizzle, Stripe (platform account, card-only, live mode active), Zod, Vitest. The webhook is shared billing infrastructure — every change is **additive** and keyed on `metadata.type` / `stripeSubscriptionId` so membership/dropin/rental/registration routing is untouched.

**Reference files to mirror (read these first in each task):** `src/lib/memberships/stripe.ts`, `src/lib/memberships/webhook-handlers.ts`, `src/pages/api/memberships/subscribe.ts`, `src/lib/db/schema/memberships.ts`, `src/lib/stripe/handle-stripe-event.ts`.

**Brief:** `docs/drop-league-brief.md` §9 (pricing $99/mo + $25 reg; billing starts at team assignment; cancel = stop at end of billing month; registration fee non-refundable, once per player).

**Phasing:** P1 done (registration). **P2 (this) billing.** P3 weigh-in + scoring engine. P4 dashboards/diary/nudges/landing.

---

## Decisions (stated)

- **Two Stripe Prices** (founder creates in Stripe live, post-merge): a **$99/mo recurring** price → env `DROP_PRICE_ID_MONTHLY`; a **$25 one-time** price → env `DROP_PRICE_ID_REGISTRATION`. Both added to `.env.example`. A subscription-mode Checkout Session can carry a recurring price + a one-time price (the one-time lands on the first invoice).
- **Account required to subscribe.** `/api/drop/subscribe` requires `locals.user` (the subscriber needs a Stripe customer + the ability to manage/cancel). Phase-1 `drop_players.userId` is linked here if not already (match by email).
- **Subscription↔player link:** `drop_subscriptions` references the `drop_players` row. One active subscription per player.
- **Webhook differentiation:** `checkout.session.completed` is routed by `metadata.type`. `customer.subscription.*` / `invoice.payment_failed` lack our metadata, so both the membership and Drop handlers run; each updates only the row whose `stripeSubscriptionId` matches (no-op otherwise). This is how memberships already coexists with other flows.

## File structure
- Modify `src/lib/db/schema/drop-league.ts` — add `dropSubscriptions` table + status enum. Migration `0046`.
- Create `src/lib/drop-league/stripe.ts` — `createDropCheckoutSession(...)` (reuses `getOrCreateStripeCustomer` from memberships).
- Create `src/lib/drop-league/webhook-handlers.ts` — `handleDropCheckoutCompleted`, `handleDropSubscriptionUpdated`, `handleDropSubscriptionDeleted`, `handleDropInvoicePaymentFailed` (mirror memberships).
- Modify `src/lib/stripe/handle-stripe-event.ts` — additive Drop routing.
- Create `src/pages/api/drop/subscribe.ts` — authed; creates the checkout session, returns `{ url }`.
- Create `src/pages/api/drop/cancel.ts` — authed; cancel-at-period-end (reuse memberships' `cancelSubscriptionAtPeriodEnd`).
- Modify `.env.example` — the two price-id vars.
- Tests: `tests/api/drop/subscribe.test.ts` (+ unit test for any pure mapping helper).

---

## Task 1: Schema — `drop_subscriptions` + migration 0046

**Files:** Modify `src/lib/db/schema/drop-league.ts`; migration `0046`.

- [ ] Step 1: Read `src/lib/db/schema/memberships.ts` to mirror the membership subscription columns/status enum. Add to `drop-league.ts`:
```typescript
export const dropSubscriptionStatusEnum = pgEnum("drop_subscription_status", ["incomplete", "active", "past_due", "paused", "cancelled"]);

export const dropSubscriptions = pgTable("drop_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dropPlayerId: uuid("drop_player_id").notNull().references(() => dropPlayers.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: dropSubscriptionStatusEnum("status").default("incomplete").notNull(),
  registrationFeePaid: boolean("registration_fee_paid").default(false).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("drop_subscriptions_player_idx").on(t.dropPlayerId),
  uniqueIndex("drop_subscriptions_stripe_sub_uniq").on(t.stripeSubscriptionId),
]);
```
(Add the needed imports: `text`, plus `boolean` already imported. Add `DropSubscription` type exports.)
- [ ] Step 2: `npm run db:generate` → `0046_*.sql`; make enum idempotent + table `IF NOT EXISTS` (note: the partial-unique on `stripe_subscription_id` should allow multiple NULLs — a plain unique index on a nullable column does in Postgres). `npm run db:migrate` local. tsc (ignore `'X 3'` noise). Commit (two commits: schema, migration).

## Task 2: Env config

**Files:** Modify `.env.example`.
- [ ] Add `DROP_PRICE_ID_MONTHLY=` and `DROP_PRICE_ID_REGISTRATION=` with comments ("$99/mo recurring Stripe Price" / "$25 one-time Stripe Price; founder creates these in Stripe and sets them in Netlify"). Commit `chore(drop): env vars for Drop subscription prices`.

## Task 3: Drop checkout helper

**Files:** Create `src/lib/drop-league/stripe.ts`.
- [ ] Read `src/lib/memberships/stripe.ts` fully. Implement `createDropCheckoutSession(opts: { customerId, dropPlayerId, dropSeasonId, organizationId, userId, successUrl, cancelUrl })` that calls `s.checkout.sessions.create({ mode: "subscription", customer, line_items: [{ price: env.DROP_PRICE_ID_MONTHLY, quantity: 1 }, { price: env.DROP_PRICE_ID_REGISTRATION, quantity: 1 }], success_url, cancel_url, metadata: { type: "drop_subscription", drop_player_id, drop_season_id, organization_id, user_id }, subscription_data: { metadata: { type: "drop_subscription", drop_player_id } } })` with an idempotency key `${dropPlayerId}:drop-checkout:v1`. Reuse `membershipsStripe()` + `getOrCreateStripeCustomer` (import from memberships/stripe). Read price ids from the env module the repo uses (`src/lib/env.ts` or `import.meta.env`/`process.env` per repo convention — check how memberships reads its price ids). Throw a clear error if a price id env is unset. Commit `feat(drop): Stripe subscription checkout helper`.

## Task 4: Webhook handlers

**Files:** Create `src/lib/drop-league/webhook-handlers.ts`.
- [ ] Read `src/lib/memberships/webhook-handlers.ts` and mirror it for `drop_subscriptions`:
  - `handleDropCheckoutCompleted(session)` — re-check `mode === "subscription"` and `metadata.type === "drop_subscription"`; upsert the `drop_subscriptions` row to `status: "active"`, store `stripeCustomerId`, `stripeSubscriptionId`, `registrationFeePaid: true`, `currentPeriodEnd`; keyed on `dropPlayerId` (idempotent).
  - `handleDropSubscriptionUpdated(sub)` — `mapStripeStatus`-equivalent; update the row matching `stripeSubscriptionId` (status, currentPeriodEnd, cancelAtPeriodEnd). No-op if no matching Drop row.
  - `handleDropSubscriptionDeleted(sub)` — set `status: "cancelled"`, `cancelledAt`.
  - `handleDropInvoicePaymentFailed(invoice)` — set `status: "past_due"` for the matching active row.
  Reuse/duplicate the `mapStripeStatus` switch (Drop's enum matches memberships'). Commit `feat(drop): subscription webhook handlers`.

## Task 5: Wire routing into the shared webhook (additive)

**Files:** Modify `src/lib/stripe/handle-stripe-event.ts`.
- [ ] Read it fully. ADD (do not change existing branches):
  - In `checkout.session.completed`: an `else if (session.metadata?.type === "drop_subscription")` branch calling `handleDropCheckoutCompleted` (before the "unrecognized" warning).
  - In `customer.subscription.created`/`updated`: ALSO call `handleDropSubscriptionUpdated(sub)` after the membership handler (each no-ops on non-matching rows).
  - In `customer.subscription.deleted`: ALSO call `handleDropSubscriptionDeleted(sub)`.
  - In `invoice.payment_failed`: ALSO call `handleDropInvoicePaymentFailed(invoice)`.
  Update the doc comment's "Full event-subscription list" if needed (events are the same set memberships already requires — no new Stripe event types). Commit `feat(drop): route drop_subscription events in the shared webhook`.

## Task 6: Subscribe + cancel endpoints (API TDD)

**Files:** Create `src/pages/api/drop/subscribe.ts`, `src/pages/api/drop/cancel.ts`; Test `tests/api/drop/subscribe.test.ts`.
- [ ] Read `src/pages/api/memberships/subscribe.ts` for the auth + customer + checkout pattern. `POST /api/drop/subscribe` `{ dropPlayerId }`: require `locals.user` (401 if not); load the `drop_players` row (must belong to the user's org; link `userId` if null); `getOrCreateStripeCustomer`; `createDropCheckoutSession`; return `{ url }`. `POST /api/drop/cancel` `{ dropSubscriptionId }`: require auth + ownership; `cancelSubscriptionAtPeriodEnd`; set `cancelAtPeriodEnd: true`. Tests: unauthenticated → 401; (price-ids unset in CI → expect a clean 500/400, not a crash — guard the test so it asserts the auth gate primarily). Commit `feat(drop): subscribe + cancel endpoints`.

## Final verification
- `npx tsc --noEmit` (ignore `'X 3'` noise) zero new errors; drop unit tests pass.
- Push, open PR, **wait for CI green** (build, test-api applies 0046, test-critical, typecheck).
- **PR body MUST list the founder post-merge steps:** create the two live Stripe Prices ($99/mo recurring + $25 one-time), set `DROP_PRICE_ID_MONTHLY` / `DROP_PRICE_ID_REGISTRATION` in Netlify, and confirm the prod webhook subscribes to `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` (memberships already requires these — likely no change).

## Spec coverage (P2 slice)
Covers brief §9 + §11 "Subscription billing" (rolling $99/mo + $25 reg, cancel at period end, status sync). Deferred: the post-registration "complete your membership" UX polish (a minimal subscribe CTA is enough for P2; full flow with P4 landing/dashboard); proration/refund edge cases; weight/scoring (P3).
