# Embedded Stripe Checkout + GTM Conversion Tracking — Design

**Date:** 2026-05-03
**Status:** Approved (design)
**Implementation phasing:** Phase 1 = embedded checkout + GTM; Phase 2 = balance reminders + cron

---

## 1. Goal

Replace the current **redirect-to-Stripe-Checkout** payment flow with an **embedded Payment Element** that lives inside the registration wizard. Add **Google Tag Manager dataLayer events** across the checkout funnel (`view_item`, `begin_checkout`, `add_payment_info`, `purchase`) so marketing can track conversions from ads with full purchase metadata. Back the client-side `purchase` event with a **server-side GA4 Measurement Protocol** fire from the existing Stripe webhook to recover conversions lost to ad blockers / iOS Intelligent Tracking Prevention.

Bring the **deposit → balance → reminders** flow onto the same plumbing: dashboard CTA + dedicated pay-balance page + magic-link deep-link + cron-driven reminder emails.

## 2. Non-goals

- Installment payments (`paymentPlans` / `scheduledPayments` tables exist but stay unused this iteration)
- Stripe-Server-Side GTM container fan-out (no infrastructure for this; leave as future work)
- Meta Conversions API (designed-for via the same `ga_client_id` capture pattern, but not implemented this iteration)
- Refund flow changes (out of scope; existing refund flow continues to work)
- Subscription billing (none planned)

## 3. Current state (audit)

**Payment flow today:**
1. Wizard step 4 collects payment option (full/deposit) + discount code
2. "Complete Registration" button → `POST /api/registrations` then `POST /api/payments/create-checkout`
3. `create-checkout` calls `createCheckoutForRegistration()` which routes to either `createCheckoutSession()` (platform-direct) or `createConnectCheckoutSession()` (Connect destination charges) — both currently return a hosted Checkout Session `url`
4. Wizard does `window.location.href = checkoutUrl` — user leaves the site
5. After Stripe charges, browser is redirected to `success_url` = `/dashboard?payment=success&registration=...`
6. Asynchronously, Stripe fires `checkout.session.completed` webhook → `handle-checkout-complete.ts` marks registration paid + sends confirmation/receipt emails

**Already correct for embedded flow (no change needed):**
- `payments.payment_type` enum: `deposit | full | balance | refund | installment`
- `paymentStatus` cycles `unpaid → deposit_paid → paid`
- `handle-checkout-complete.ts` correctly handles a second payment against the same registration: increments `amountPaidCents`, decrements `amountDueCents`, flips to `paid` when balance hits zero
- Idempotency keys are amount-suffixed (`${registrationId}:checkout:${amountCents}`) so deposit + balance don't collide
- `create-checkout-for-registration.ts` already returns the correct remaining balance for any registration in `deposit_paid` state — no logic change needed for balance pay

**Genuinely missing:**
- No UI surface to pay a balance (`/api/payments/create-checkout` is only called from the registration wizard today)
- No reminder email template
- No cron / scheduled fire to send reminders
- No client-side dataLayer ecommerce events (only PostHog server captures of `checkout_initiated` / `checkout_zero_amount`)
- No server-side GA4 Measurement Protocol fire

## 4. Architecture

### 4.1 Wizard step 4 — two sub-states inside one step

**4a — Order configuration** (today's UI, retained)
- Order summary, payment-option chooser (full / deposit), discount-code input
- Bottom CTA changes from "Complete Registration" → **"Continue to Payment"**
- On click: creates the registration (`POST /api/registrations`) AND creates a Checkout Session with `ui_mode: 'custom'` (`POST /api/payments/create-checkout`), then transitions to 4b
- Fires `view_item` on first mount of step 4
- Fires `begin_checkout` on Continue-to-Payment click

**4b — Embedded payment**
- Locked order summary on top (no more discount edits — explicit "Back" cancels the in-flight session and returns to 4a)
- Stripe `<PaymentElement />` rendered inline (card / Apple Pay / Google Pay / Link), themed via `appearance` to match editorial cream palette
- "Pay $X" button below the element
- Fires `add_payment_info` when Payment Element reports `change` event with `complete: true` (debounced — only fire once per session)
- On success: fires `purchase`, transitions to step 5 (or Telegram step → step 5)
- On 3DS / bank-auth challenge: redirect to `return_url`; the return page resolves status and continues the flow

### 4.2 Server-side changes — Checkout Session creation

**`src/lib/stripe/client.ts` — `createCheckoutSession`**
- Add `ui_mode: 'custom'`
- Drop `success_url` / `cancel_url` (custom mode handles success client-side via `confirmPayment`)
- Return `{ id, clientSecret }` instead of `{ id, url }`

**`src/lib/stripe/connect.ts` — `createConnectCheckoutSession`**
- Same `ui_mode: 'custom'` change. Connect destination charges work identically in custom mode (the `payment_intent_data.transfer_data` block is unchanged)
- Return `{ id, clientSecret }` instead of `{ id, url }`

**`src/lib/payments/create-checkout-for-registration.ts`**
- Change `CheckoutResult.kind === 'stripe_session'` shape from `{ checkoutUrl, sessionId }` to `{ clientSecret, sessionId }`
- All other logic unchanged (discount handling, zero-amount short-circuit, Connect routing decision, etc.)

**`src/pages/api/payments/create-checkout.ts`**
- Return `{ clientSecret, sessionId, publishableKey }` instead of `{ checkoutUrl, sessionId }` — `publishableKey` reads `STRIPE_PUBLISHABLE_KEY` server-side
- Capture `ga_client_id` from the `_ga` cookie (parsed `GA1.1.<client_id>` format), pass into `extraMetadata` so it lands on the Stripe session metadata
- Capture `gclid` and `fbclid` from request URL query params or referrer cookie if present (forward-compat for Meta CAPI / Google Ads enhanced conversions)

**`src/pages/api/registrations/guest-checkout.ts`**
- Same return-shape change (incl. `publishableKey`)
- Same `ga_client_id` / `gclid` / `fbclid` capture

### 4.3 New client modules

**`src/lib/analytics/datalayer.ts`** — typed wrappers for the four ecommerce events:

```ts
interface SeasonItem {
  id: string;            // seasonId
  name: string;          // "<program> - <season>"
  category: string;      // sport name
  category2: string;     // location name
  priceCents: number;    // unit price (full season price, not balance)
}

trackViewItem(item: SeasonItem): void;
trackBeginCheckout(item: SeasonItem, valueCents: number, coupon?: string): void;
trackAddPaymentInfo(item: SeasonItem, valueCents: number, paymentType: string, coupon?: string): void;
trackPurchase(transactionId: string, item: SeasonItem, valueCents: number, paymentType: 'deposit' | 'balance' | 'full', coupon?: string): void;
```

Each helper:
1. Calls `window.dataLayer.push({ ecommerce: null })` first to clear (per GA4 docs — prevents object-merge across events)
2. Pushes the GA4-spec ecommerce event with `currency: 'USD'`, `value`, `items: [...]`
3. Soft-fails if `window.dataLayer` is undefined (e.g. GTM blocked)

**`src/components/registration/embedded-payment.tsx`** — new component:
- Props: `clientSecret`, `publishableKey`, `seasonItem`, `valueCents`, `coupon`, `paymentType`, `returnUrl`, `onSuccess(paymentIntentId)`, `onCancel()`
- Wraps `<Elements stripe={stripePromise} options={{ clientSecret, appearance, loader: 'auto' }}>`
- Renders `<PaymentElement options={{ layout: 'accordion' }} />`
- Listens to `change` events; fires `trackAddPaymentInfo` on first complete state
- Pay button disabled until element is `complete`
- On click: `stripe.confirmPayment({ elements, confirmParams: { return_url }, redirect: 'if_required' })`
  - Synchronous success (no SCA): fire `trackPurchase(paymentIntent.id, ...)`, call `onSuccess(paymentIntent.id)`
  - SCA / bank redirect: browser navigates to `return_url`
  - Error: surface inline via `<ErrorBanner>` (per CLAUDE.md UI feedback convention)

**`src/pages/payment/return.astro`** — new page (SSR; no `prerender = true`):
- Reads `?payment_intent=...&payment_intent_client_secret=...` from URL
- Server-side: `stripe.paymentIntents.retrieve(paymentIntentId)`
- Branches on `status`:
  - `succeeded`: server-renders order details (look up registration via metadata), client fires `trackPurchase`, then JS redirects to `/dashboard?registered=...` after 2s (or immediately on click)
  - `processing`: shows "your payment is processing — we'll email you" copy + redirect to dashboard
  - `requires_payment_method`: redirects back to wizard with error banner
  - other: generic error with retry path

### 4.4 New server module — GA4 Measurement Protocol

**`src/lib/analytics/ga4-measurement-protocol.ts`**

```ts
interface SendPurchaseEventInput {
  clientId: string;            // from _ga cookie
  transactionId: string;       // PaymentIntent ID
  valueCents: number;          // amount_paid for THIS payment (deposit OR balance)
  currency: 'USD';
  items: Array<{ id: string; name: string; category: string; priceCents: number }>;
  coupon?: string;
  paymentType: 'deposit' | 'balance' | 'full';
}

sendPurchaseEvent(input: SendPurchaseEventInput): Promise<void>
```

- POSTs to `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`
- Body shape per GA4 MP spec: `{ client_id, events: [{ name: 'purchase', params: { transaction_id, value, currency, items, coupon, payment_type } }] }`
- Soft-fail: logs and swallows errors, never blocks webhook ack
- Returns early if env vars unset (treats as opt-out)

### 4.5 Webhook changes

**`src/lib/stripe/handle-checkout-complete.ts`**
- After existing `payments` insert + status update + email sends, add GA4 fire:
  - Pull `ga_client_id` from `session.metadata`
  - Skip if absent (user blocked `_ga`, pre-launch test, etc.)
  - Pull program/season/sport/location for item context (already done for emails — reuse the same `[row]` JOIN result)
  - Derive `paymentType` (matches the existing pattern at `handle-checkout-complete.ts:64-65`):
    - If prior `registration.amountPaidCents > 0` → `'balance'` (this is the second+ payment)
    - else if `registration.registrationType === 'deposit'` → `'deposit'`
    - else → `'full'`
  - Call `sendPurchaseEvent({ clientId, transactionId: paymentIntentId, valueCents: amountPaid, ... })` fire-and-forget (`.catch(console.error)`)
- Same `transaction_id` is used by the client-side fire → GA4 dedupes within the standard window

### 4.6 Environment variables

Add to `src/lib/env.ts` and `.env.example`:
- `GA4_MEASUREMENT_ID` — e.g. `G-XXXXXXXXXX`
- `GA4_API_SECRET` — generated in GA4 Admin → Data Streams → Measurement Protocol API Secrets

Both **soft-required** (same pattern as the integration secrets in commit `493cae6`): missing values disable the server-side fire but don't crash the site or break checkout.

`STRIPE_PUBLISHABLE_KEY` is server-side only today (not `PUBLIC_*` prefixed). Rather than rename the env var and break deployed environments, the API endpoint (`/api/payments/create-checkout` and `/api/registrations/guest-checkout`) returns it alongside `clientSecret` in the JSON response. The client component receives both as runtime values from the API call. No env rename, no breaking change for deployed environments.

### 4.7 GTM container configuration (operator task, not code)

This is configuration done by the operator inside the GTM UI, captured here so it doesn't get lost:

1. **GA4 Configuration tag** (likely already set up) — fires on All Pages, sends Measurement ID
2. **GA4 Event tags** — one per ecommerce event, triggered by Custom Event matching:
   - `view_item` → GA4 Event tag, event name = `view_item`, ecommerce data via Data Layer Variables
   - `begin_checkout` → similar
   - `add_payment_info` → similar
   - `purchase` → similar
3. **Conversion Linker** (likely already set up) — Fires on All Pages
4. **Google Ads Conversion Tracking** tag triggered on `purchase`:
   - Conversion ID + label from Google Ads
   - Conversion Value: `{{DLV - ecommerce.value}}`
   - Currency: `{{DLV - ecommerce.currency}}`
   - Order ID: `{{DLV - ecommerce.transaction_id}}` (dedupe across pixel + Enhanced Conversions)
5. **Data Layer Variables** to define:
   - `DLV - ecommerce.value`
   - `DLV - ecommerce.currency`
   - `DLV - ecommerce.transaction_id`
   - `DLV - ecommerce.coupon`
   - `DLV - ecommerce.items`

A markdown checklist mirroring this section will live in the implementation plan for hand-off.

## 5. Balance payment flow

The plumbing already supports it; only surfaces are new.

### 5.1 Dashboard CTA

**`src/components/dashboard/registrations-card.tsx`** — when `paymentStatus === 'deposit_paid'`:
- Show a "Pay $X balance" CTA button next to the existing registration row
- Show season start date as the implicit deadline
- Button links to `/dashboard/registrations/[id]/pay-balance`

### 5.2 Pay-balance page (signed-in users)

**`src/pages/dashboard/registrations/[id]/pay-balance.astro`** — new page (SSR):
- Reads `id` from path, validates ownership via `Astro.locals.user`
- Loads registration; 404 if not owned, 400 if `paymentStatus !== 'deposit_paid'`
- Renders `<EmbeddedPayment registrationId={id} mode="balance" />` (same component as wizard step 4b)
- The component calls `POST /api/payments/create-checkout` to get a fresh clientSecret for the balance amount
- Same dataLayer events fire: `view_item` on mount, `begin_checkout` on payment ready, `add_payment_info` on card complete, `purchase` on success
- The `purchase` event uses the **new** PaymentIntent ID as `transaction_id` (NOT the original deposit's PI). `value = balanceAmount`. `payment_type: 'balance'`. Standard ecommerce treatment — GA4 / Ads see deposit and balance as additive revenue events.
- On success: redirects to `/dashboard?registered=...` with confirmation banner

### 5.3 Magic-link deep-link page (guest-checkout users)

**`src/pages/payment/[registrationId].astro`** — new page (SSR):
- Accepts `?token=<magic_link_token>` query param
- Validates token via existing magic-link infrastructure (`src/lib/auth/magic-link.ts` — already used for guest-checkout post-purchase login)
- On valid token: creates a session, redirects to `/dashboard/registrations/[registrationId]/pay-balance`
- On invalid/expired token: redirects to `/auth/link-expired`

This lets balance-reminder emails sent to guest-checkout parents work without forcing a separate sign-in step.

## 6. Reminder emails

### 6.1 Email template

**`src/lib/email/templates/payment-balance-reminder.tsx`** — new React Email template:
- Matches editorial cream styling of `payment-receipt.tsx`
- Subject: `Balance due: $X — [program] [season]`
- Variables: parent name, child name, program name, season name, balance cents, season start date (rendered as deadline), pay-balance deep link, organization name (for from-line attribution)
- CTA: "Pay balance now" → button linking to:
  - Authenticated user: `${PUBLIC_APP_URL}/dashboard/registrations/${id}/pay-balance`
  - Guest-checkout user: `${PUBLIC_APP_URL}/payment/${id}?token=${magicLinkToken}`

### 6.2 Send helper

**`src/lib/email/send.ts`** — new exported function `sendBalanceReminderEmail()`:
- Mirrors signature pattern of `sendPaymentReceiptEmail()` and `sendRegistrationConfirmationEmail()`
- Inputs: `userId`, `organizationId?`, `registrationId`, `parentEmail`, `parentName`, `childName`, `programName`, `seasonName`, `balanceCents`, `deadlineDate`, `payBalanceUrl`, `reminderType: 't21' | 't7' | 't1'`
- Sends via Resend (existing infra)
- Logs to `email_logs` with `emailType = 'balance_reminder_${reminderType}'` so the cron's idempotency check is meaningful

### 6.3 Cron endpoint

**`src/pages/api/cron/send-balance-reminders.ts`** — new endpoint:
- `Authorization: Bearer ${CRON_SECRET}` (already existing convention; `CRON_SECRET` env var already in place per commit `493cae6`)
- For each window in `[T-21, T-7, T-1]`:
  - Query registrations:
    ```sql
    SELECT r.*, s.startDate, fm.firstName as childFirst, fm.lastName as childLast,
           p.name as programName, s.name as seasonName, u.email, u.firstName as parentFirst
    FROM registrations r
    JOIN seasons s ON r.seasonId = s.id
    JOIN programs p ON s.programId = p.id
    JOIN family_members fm ON r.familyMemberId = fm.id
    JOIN users u ON r.registeredByUserId = u.id
    WHERE r.paymentStatus = 'deposit_paid'
      AND r.status NOT IN ('cancelled', 'refunded', 'waitlisted')
      AND s.startDate = CURRENT_DATE + INTERVAL '<window> days'
    ```
  - For each row:
    - Skip if `email_logs` already has `(registrationId, emailType='balance_reminder_t<window>')` row
    - Compute balance: `r.amountDueCents - r.amountPaidCents`
    - For guest-checkout users (detect via the same heuristic used elsewhere — `users.passwordHash IS NULL` or similar; confirm during implementation), mint a magic-link token via `createMagicLink({ purpose: 'login', purposeContext: { redirectTo: `/dashboard/registrations/${id}/pay-balance` } })`
    - Call `sendBalanceReminderEmail(...)`
- Returns JSON: `{ window: 't21', sentCount, skippedCount, errorCount }` per window, plus an aggregate
- Soft-fail per row: one failed send doesn't kill the batch; failures logged with `console.error`

### 6.4 Schedule

**`netlify.toml`** — add scheduled function entry:
```toml
[functions."send-balance-reminders"]
schedule = "0 14 * * *"   # 14:00 UTC daily ≈ 9-10am ET
```

(Single daily fire handles all three windows; each is independently gated by its own `email_logs` check.)

If Netlify scheduled functions don't play well with Astro's API routes (TBD during implementation — verify), fallback is an external cron service hitting the endpoint with the bearer token. Either way, the endpoint itself is identical.

## 7. Edge cases + decisions

| Case | Decision |
|---|---|
| User changes discount/payment-option after Checkout Session created (4b) | "Back" button cancels the in-flight session (no Stripe-side cancel needed; orphaned sessions self-expire), returns to 4a. New Continue-to-Payment creates a new session. Idempotency key includes `amountCents`, so the new amount → new key → no collision. |
| User closes tab mid-payment | Webhook is ground truth. If Stripe charged the card, `handle-checkout-complete.ts` marks paid + sends emails + fires server-side GA4 event. Client-side `purchase` is missed but server-side covers it. |
| 3DS / SCA challenge | `confirmPayment` redirects to bank → `return_url` = `/payment/return`. Return page checks PaymentIntent status and proceeds (success / processing / failure branches as in 4.3). |
| Refund issued before balance paid | Existing refund flow updates `paymentStatus` to `partial_refund` or `refunded`. Reminder cron suppresses (`paymentStatus = 'deposit_paid'` only). |
| Season already started | Reminder cron WHERE clause requires `s.startDate >= CURRENT_DATE`. Past-start balances surface in admin "balance overdue" report (existing or future — out of scope). |
| Guest-checkout user mid-balance-pay loses their magic-link token | Re-trigger by requesting another reminder, or surface "request new link" copy on `/auth/link-expired`. Not solving in this iteration. |
| GA4 client_id absent (user blocked `_ga`, dev/local without GTM loaded) | Server-side fire short-circuits; client-side fire short-circuits (`window.dataLayer` exists but events have no client_id — GTM still pushes them, GA4 ignores or generates an anonymous client_id). Acceptable. |
| Same registration paid in full at once (no deposit) | `paymentType = 'full'`. Single `purchase` event. No reminders needed. |
| Adult self-registration (not parent + child) | No flow change. `family_member.selfUserId IS NOT NULL` path renders the same; reminder copy uses participant name as both "parent" and "child" — acceptable since the copy reads as "Balance due for [name]". Will verify during template implementation. |
| Connect destination charges | Identical to platform-direct in custom mode. Application fee + transfer_data unchanged. |

## 8. Files touched summary

### Modify (12)
- `src/lib/stripe/client.ts` — `ui_mode: 'custom'`, return `clientSecret`
- `src/lib/stripe/connect.ts` — same
- `src/lib/stripe/handle-checkout-complete.ts` — server-side `purchase` fire with derived `paymentType`
- `src/lib/payments/create-checkout-for-registration.ts` — `CheckoutResult` shape change
- `src/pages/api/payments/create-checkout.ts` — return `clientSecret` + `publishableKey`; capture `ga_client_id`/`gclid`/`fbclid`
- `src/pages/api/registrations/guest-checkout.ts` — same
- `src/components/registration/payment-step.tsx` — restructure for 4a/4b sub-states
- `src/components/registration/registration-wizard.tsx` — wire embedded payment, retire `window.location.href` redirect, preserve Telegram-step gating
- `src/components/dashboard/registrations-card.tsx` — "Pay balance" CTA
- `src/lib/email/send.ts` — add `sendBalanceReminderEmail()`
- `src/lib/env.ts` + `.env.example` — `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` (soft-required)
- `netlify.toml` — `send-balance-reminders` schedule

### Create (8)
- `src/lib/analytics/datalayer.ts` — typed dataLayer wrappers
- `src/lib/analytics/ga4-measurement-protocol.ts` — server-side GA4 client
- `src/components/registration/embedded-payment.tsx` — Elements + PaymentElement + pay button + state
- `src/pages/payment/return.astro` — 3DS/bank-auth redirect-back handler
- `src/pages/payment/[registrationId].astro` — guest magic-link landing for balance pay
- `src/pages/dashboard/registrations/[id]/pay-balance.astro` — signed-in pay-balance page
- `src/pages/api/cron/send-balance-reminders.ts` — daily reminder cron
- `src/lib/email/templates/payment-balance-reminder.tsx` — Resend template

### New dependencies
- `@stripe/stripe-js` (~30KB gzipped, already a transitive dep — verify; load only on payment surfaces)
- `@stripe/react-stripe-js` (~20KB gzipped, peer of stripe-js)

### No DB schema changes
- `payments.metadata` is already JSON, no new columns
- `email_logs.emailType` is already varchar(50), holds the new `balance_reminder_t*` values
- `ga_client_id` rides on Stripe session metadata (no DB write)

## 9. Implementation phasing

**Phase 1 — Embedded checkout core**
- Sections 4.1, 4.2, 4.3 (datalayer + embedded-payment + return page only), 4.4, 4.5, 4.6, 4.7
- Initial registration payment goes embedded
- Adds dataLayer events + server-side GA4 backup
- Files: 9 modified (`client.ts`, `connect.ts`, `handle-checkout-complete.ts`, `create-checkout-for-registration.ts`, `create-checkout.ts`, `guest-checkout.ts`, `payment-step.tsx`, `registration-wizard.tsx`, `env.ts`/`.env.example`), 4 created (`datalayer.ts`, `ga4-measurement-protocol.ts`, `embedded-payment.tsx`, `return.astro`)

**Phase 2 — Balance payment surfaces + reminders**
- Sections 5, 6
- Dashboard balance CTA + pay-balance page + magic-link deep-link
- Reminder template + cron + Netlify schedule
- Files: 3 modified (`registrations-card.tsx`, `send.ts`, `netlify.toml`), 4 created (`payment-balance-reminder.tsx`, `send-balance-reminders.ts`, `[registrationId].astro`, `pay-balance.astro`)

Phase 1 ships independently. Phase 2 is pure additive on top.

## 10. Verification / testing

For Phase 1:
- API test: `tests/api/payments-create-checkout.test.ts` updated to assert `clientSecret` returned (not `checkoutUrl`)
- API test: new `tests/api/payments-ga4-tracking.test.ts` asserting `ga_client_id` round-trips through session metadata
- Unit test: `tests/unit/datalayer.test.ts` asserting helpers push correctly shaped events with the `ecommerce: null` reset
- E2E test: existing registration→payment Playwright spec updated to drive embedded form (using Stripe test cards `4242...`) instead of redirect
- Manual: 3DS test (`4000002500003155`) → verify `/payment/return` flow
- Manual: cancel mid-flow → verify orphaned session, retry creates new session

For Phase 2:
- API test: cron endpoint with `CRON_SECRET` returns expected counts
- API test: cron endpoint without auth returns 401
- Unit test: idempotency (same window run twice → second is no-op)
- Manual: trigger T-7 fire against a known `deposit_paid` registration, verify email + magic-link land correctly

Pre-push checklist (per CLAUDE.md): `db:generate` (no schema), `db:seed:e2e`, API tests, Playwright, build, `tsc --noEmit`.
