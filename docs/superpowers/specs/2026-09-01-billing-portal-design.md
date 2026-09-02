# Stripe billing portal — self-serve card updates + period-end self-cancel

**Date:** 2026-09-01
**Status:** Approved design (owner: build now; self-cancel ALLOWED at period end)
**Branch:** `billing-portal` off main (post-#602)

## Problem

Memberships bill monthly per child. When a card fails, the membership goes
`past_due` and the parent has NO self-serve fix — no card-update surface exists
platform-wide; dunning is contact-only and quietly churns. (Long-standing
tracked follow-up from the #586 memberships build.)

## Design

Use Stripe's hosted **Customer Portal**. We build exactly two things:

### 1. Portal-session endpoint

`POST /api/memberships/billing-portal` (authed):
- Resolve the caller's Stripe customer id from their `memberships` rows
  (`stripeCustomerId`, newest row with one set — explicit `orderBy`). No
  membership/customer → 404 `{ error: "no_billing_account" }`.
- `stripe.billingPortal.sessions.create({ customer, configuration, return_url })`
  → `{ url }`. `return_url` = env-aware origin + `/dashboard/family` (or the
  referring dashboard path passed in the body from an allow-list of the two
  dashboard pages — never a client-supplied free URL).
- **Portal configuration is code-managed** (no Stripe-Dashboard hand setup):
  `ensureBillingPortalConfiguration()` in `src/lib/memberships/billing-portal.ts`
  finds (by `metadata.aspire_config = "v1"`) or creates a
  `billingPortal.configurations` object with:
  - `payment_method_update: enabled`
  - `invoice_history: enabled`
  - `subscription_cancel: { enabled, mode: "at_period_end" }` (owner decision;
    prorations none)
  - `subscription_pause: disabled` (in-app pause endpoint already exists; two
    pause paths would fight)
  - `subscription_update: disabled` (tier changes stay in-app)
  - business_profile headline from the brand name.
  Config id cached module-level per process; lookup-by-metadata on cold start.
  Same accepted posture as other Stripe reconciliation code: test/live modes
  each get their own config on first use.

No schema changes. No webhook changes — portal-driven card updates fire
`customer.subscription.updated` (already handled: past_due → active on
recovery) and period-end cancels fire `customer.subscription.deleted`
(already handled: membership cancelled + enrollments ended + seats released
via the shared sweep from #602).

### 2. Dashboard surfaces

- **Family dashboard (`family-classes-card.tsx`)**: when a child's membership
  is `past_due`, the existing contact-only state becomes an action: banner
  "Your card needs updating" + button **Update payment method** → POST →
  redirect to the portal URL. When active: a low-key **Manage billing** link
  in the membership area.
- **Adult `MembershipCard.tsx`**: same two states, same button.
- Both use the existing island fetch/error conventions (shape-tolerant error
  message, toast on failure). No waiver/credits surfaces touched.

## Out of scope

Tier up/down-grades in the portal; pause via portal; per-child payment
methods (one customer per parent covers all their subscriptions); Connect
brand-split portal branding (Stripe account-level branding applies).

## Testing

- API: 401 unauthed; 404 for a user with no membership/customer; happy path
  (`itWithStripe`) returns a `billing.stripe.com` URL; return-url allow-list
  rejects arbitrary paths; configuration created once then reused (two calls,
  one config — assert via list-by-metadata).
- UI: past_due state renders the button (component-level or E2E per repo
  convention); active state renders the link.
- E2E: seeded past_due membership → dashboard shows "Update payment method";
  click → POST fires (stubbed redirect per the established stubbed-POST
  pattern; we never drive the real Stripe portal in E2E).

## Execution

Same pipeline, small: T0 endpoint+configuration (Opus), T1 dashboard surfaces
(Sonnet), T2 ship gates + E2E (Sonnet). CI green gates the PR.
