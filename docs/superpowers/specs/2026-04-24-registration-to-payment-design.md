# Registration → Payment (Sandbox End-to-End)

**Date:** 2026-04-24
**Scope:** Make the parent registration wizard drive a Stripe sandbox Checkout Session all the way through to a `paid` / `confirmed` registration, with correct webhook handling and a reasonable success/cancel UX.
**Mode:** Stripe test mode (sandbox). Live-mode cutover and Connect routing are out of scope.

---

## Context

The codebase already has the plumbing for registration → payment:

- `src/components/registration/registration-wizard.tsx` — 3-step wizard (player → waiver → payment) that POSTs `/api/registrations` then `/api/payments/create-checkout` and redirects to `session.url`.
- `src/pages/api/registrations/index.ts` — creates a `pending` / `unpaid` row, returns `requiresPayment`. Already handles the "resume an abandoned registration" case when checkout creation previously failed.
- `src/pages/api/payments/create-checkout.ts` — validates ownership, applies discount codes, calls `createCheckoutSession`, returns the Checkout URL. Already shapes Stripe auth vs. API errors into parent-friendly messages.
- `src/pages/api/webhooks/stripe.ts` — handles `checkout.session.completed`, flips the registration to `confirmed` / `paid`, writes a `payments` row.
- `src/lib/stripe/client.ts` / `src/lib/stripe/connect.ts` — Checkout Session + Connect helpers. Connect is not wired into the wizard path (HQ-only today).

Stripe CLI is configured in sandbox; env vars `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` are set.

## Goals

1. A parent can register a player through the wizard, complete a test-card Stripe Checkout, and see the registration row flip to `paid` / `confirmed` within seconds.
2. Webhook retries are safe (idempotent).
3. The post-payment success and cancel UX is clear — no raw dashboard with query params.
4. The confirmation email fires only after a successful payment (not on pending create).

## Non-Goals

- Stripe Connect split payments for franchises.
- Afterpay / BNPL payment methods.
- Payment plans / installments (schema exists; wizard does not use it).
- Live-mode cutover and domain onboarding.
- Schema changes.

---

## Architecture

```
Wizard              /api/registrations         /api/payments/create-checkout     Stripe Checkout
  |                      |                                |                             |
  |--submit payload----->|                                |                             |
  |                      |--insert pending/unpaid row---->|                             |
  |<--requiresPayment----|                                |                             |
  |-------------- POST registrationId + discount -------->|                             |
  |                                                       |--sessions.create ---------->|
  |<---------------------- checkoutUrl -------------------|                             |
  |------------------------------------ window.location = checkoutUrl ----------------->|
  |                                                                                     |
  |                                         parent pays with test card                  |
  |                                                                                     |
  |<-------- 302 to /dashboard?payment=success&registration=<id> -----------------------|
  |
  |                            webhook --> /api/webhooks/stripe
  |                                                       |
  |                                          registration.status       = "confirmed"
  |                                          registration.paymentStatus= "paid"/"deposit_paid"
  |                                          payments row inserted (idempotent)
  |                                          confirmation email sent (once)
```

## Phase 1 — Verifiable sandbox flow

The dev server needs to receive `checkout.session.completed` webhooks, or payment "succeeds" but the registration never advances. In local development that means the Stripe CLI.

**Deliverables**
- `npm run stripe:listen` script in `package.json` running `stripe listen --forward-to localhost:4321/api/webhooks/stripe --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed`.
- A short section in `README.md` (or a new `docs/stripe-sandbox.md`) covering the three required env vars and the CLI-listen workflow, including the reminder that the CLI prints a temporary `whsec_…` that must be pasted into `.env` for signatures to verify.
- Manual smoke test (documented, not automated):
  1. `npm run dev` + `npm run stripe:listen` in two terminals.
  2. Sign in as `parent@test.aspiresports.com` / `TestParent123!`.
  3. Register a player for any open season.
  4. Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
  5. Confirm DB: `registrations.status = 'confirmed'`, `paymentStatus = 'paid'`, one `payments` row with `status = 'succeeded'`.

No code changes beyond the script and docs.

## Phase 2 — Correctness

### 2.1 Webhook idempotency

`handleCheckoutComplete` in `src/pages/api/webhooks/stripe.ts` currently:

```ts
amountPaidCents += session.amount_total
insert into payments (…stripeCheckoutSessionId = session.id…)
```

Stripe retries webhooks on any non-2xx response, on its own timer, or if we take too long. Today, a retry double-counts `amountPaidCents` and inserts a duplicate `payments` row.

**Fix**
- Before inserting the `payments` row, query `payments` by `metadata->>'stripeCheckoutSessionId' = session.id` (the field lives in `metadata`, not as a top-level column — verify schema and use whatever column the existing insert uses).
- If a row already exists, return 200 immediately without mutating state. Log at `info`.
- Otherwise proceed with the existing update + insert.

This is the smallest change that makes retries safe. A future cleanup could add a dedicated `stripe_checkout_session_id` column with a unique index, but that's schema work and outside this scope.

### 2.2 Confirmation email moves to webhook

Today `api/registrations/index.ts` POST sends `sendRegistrationConfirmationEmail` right after inserting the pending row. That means a parent gets a "you're registered" email before they pay, and again if they abandon and come back via the resume path.

**Fix**
- Remove the email send from the **pending** branch of `POST /api/registrations` (lines ~325–359).
- Keep the email send in the **waitlisted** branch — waitlisted parents don't pay, so that's their only confirmation.
- Add the email send to `handleCheckoutComplete` after the DB updates, inside the new idempotency guard so retries don't re-send.

Required email inputs (program name, location, schedule notes, etc.) need to be fetched in the webhook. Keep it as a simple inner join from `registrations → seasons → programs → locations`, same pattern already used in the API route.

### 2.3 Deterministic duplicate lookup

`registrations/index.ts:179` selects the existing `(seasonId, familyMemberId)` row without `orderBy`. Per the CLAUDE.md multi-tenant hazards note, add an explicit `orderBy(asc(registrations.createdAt))` so behavior matches local and CI.

### 2.4 Minor cleanup in `create-checkout.ts`

Line 23 declares `const db = getDb()` but then every query re-calls `getDb()`. Replace subsequent `getDb()` calls with `db`. Pure readability; no behavior change.

## Phase 3 — Success & cancel UX

### 3.1 `/dashboard?payment=success&registration=<id>`

Right now the parent lands back on a raw dashboard after paying. If the webhook hasn't fired yet, they also see `paymentStatus = "unpaid"` in their dashboard and panic.

**Design**
- On `/dashboard`, read `payment` and `registration` query params server-side in the Astro page.
- If `payment=success`, render a dismissible success banner at the top of the dashboard: "Thanks! Registration for {playerName} confirmed." Include the program and season name.
- Client-side, if `registration=<id>` is present and that row's `paymentStatus !== 'paid'`, poll `GET /api/registrations` every 2 seconds up to ~15 seconds, then stop. This covers the normal "webhook is 1–3 seconds behind" case without making the user refresh. After polling stops (success or timeout), strip the query params via `history.replaceState` so a refresh doesn't re-trigger the banner.
- If polling times out without success, the banner switches to: "Your payment went through. We're finalizing your registration — refresh in a moment to see it confirmed." No error — just a softer message.

### 3.2 `/register/:seasonId?payment=cancelled`

Today cancel lands on the wizard with no messaging. The pending registration row still exists from Phase 1.

**Design**
- Read `payment=cancelled` server-side and pass a flag into the wizard.
- The wizard, on mount, checks for an existing pending-unpaid registration for the current user + season. If found and `payment=cancelled`, skip the wizard steps and show a "Finish payment" screen with a single button that calls `POST /api/payments/create-checkout` with the existing `registrationId`.
- Also gives us the resume-after-checkout-cancel flow that the API already supports on the server.

### 3.3 Error surface in wizard

The wizard currently `throw new Error(data.error)` from Stripe failures and displays the raw message. The API already returns friendlier copy for `stripe_auth_error` and `stripe_error`. Nothing to change in the API — just verify the wizard renders the returned `error` string (not `error.message` of a generic fallback) and that the existing UI doesn't truncate it.

---

## Testing

### Unit (Vitest)

- `tests/api/webhooks/stripe.test.ts` — or `tests/unit/…` depending on convention. Cases:
  - Valid `checkout.session.completed` → registration confirmed, payments row inserted, email fn called once.
  - Second delivery of the same event → no DB mutation, email fn NOT called again, 200 returned.
  - `amount_total` equal to `amountDueCents` → `paymentStatus = 'paid'`.
  - `amount_total` equal to `depositCents` with `registrationType = 'deposit'` → `paymentStatus = 'deposit_paid'`.
  - Event whose metadata is not `type: 'registration_payment'` → skipped, no mutation.

Stripe event objects are stubbed; the signature-verify path is exercised through a helper that bypasses signature check for the test path, or by calling `handleCheckoutComplete` directly if it's exported. The email sender is mocked.

### Integration (existing Vitest API suite)

- Add a test that POSTs `/api/registrations` twice with the same `(seasonId, familyMemberId)` and asserts the second call returns the **same** row with `resumed: true` (covers the Phase 1 resume branch in existing code and the determinism fix in 2.3).

### Manual / E2E

No Playwright for the actual Stripe Checkout — it's out-of-origin, heavy, and flaky. The manual smoke test in Phase 1 is the end-to-end verification.

---

## Rollout

1. Land Phase 1 (script + docs) — no production risk.
2. Land Phase 2 (webhook idempotency, email move, orderBy, cleanup) — no schema change, covered by unit tests.
3. Land Phase 3 (success banner + cancel flow) — UI only.
4. Smoke-test the full path with a test card.

All three phases can ship in a single PR since they're tightly coupled and all test-mode only.

## Follow-ups (not this spec)

- Connect wiring for franchises (needs design work on app-fee structure).
- Afterpay enablement + Stripe domain verification (part of launch-readiness memo).
- Dedicated `stripe_checkout_session_id` unique column for stronger idempotency.
- Payment plan / installment UX.
- Playwright coverage for success/cancel banners (not Checkout itself).
