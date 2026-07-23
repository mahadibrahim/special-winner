# Team one-page reserve + deferred account creation

**Date:** 2026-07-23
**Branch:** `feat/checkout-reserve-redesign` (continues after PR #466)
**Scope:** team registration flow only. Solo flow tracked in issue #467.

## Problems

From an owner cut-check of the just-shipped team checkout:

1. **Silent account creation + forced login on return.** `POST /api/public/team-registrations` creates a user account + session (and the team) the moment the captain submits name/email on step 1 — before any payment. On return with the same email, the endpoint 409s and forces a magic-link login. So an abandoned attempt leaves an orphan account and a login wall.
2. **Two screens.** Details (step 1) then payment (step 2) are separate screens.
3. **Confusing over-large-discount error.** A code that would drop the team total to/below the $200 deposit returns "This code would reduce the team total below the $200 deposit" — reads like the code is broken.

## Goal

One reserve screen (details + payment together). **Nothing — no user, no team — created until the $200 deposit succeeds.** An abandoned attempt leaves only an expiring Stripe PaymentIntent. Honest over-large-discount message. Team flow only.

## Entry paths (identity resolved before the reserve form)

- **New email** → the one page: team name + your name + backstop consent + price breakdown + optional discount + Stripe payment inline. Account + team created only on deposit success.
- **Existing email** → detected on email blur (lightweight check), routed to a one-tap magic-link sign-in *before* the rest of the form. After sign-in they return authed and complete the reserve.
- **Already signed in** → straight to the reserve form (identity known; no account deferral needed — team still created on payment success).

## Data flow — "nothing until payment"

1. **Email check** — `POST /api/public/team-registrations/email-check` `{ email }` → `{ exists }`. Existing → client shows sign-in gate. New → reveal the rest of the form. (Reuse an existing email-lookup helper if one exists.)
2. **Prepare** — when the form is complete, `POST /api/public/team-registrations/prepare` `{ seasonId, captainEmail, teamName, captainName, notes?, backstopConsent, discountCode? }`:
   - Re-check email doesn't now belong to an account (guest path only). If it does → `409 needs_sign_in`.
   - Compute effective team fee (early-bird) and, if a valid discount, the discounted fee (reject over-large client- and server-side).
   - Create a Stripe **customer** (keyed by email; billing object only — not an app user) and a **$200 PaymentIntent** with `setup_future_usage: off_session` and metadata: `kind: "team_deposit_pending"`, `seasonId`, `captainEmail`, `captainName`, `teamName`, `notes`, `backstopConsent`, `brand`, `teamFeeCents` (effective, post-discount), `discountCode`, `discountCents`, and `captainUserId` when the caller is already authed.
   - Return `{ clientSecret, publishableKey }`. **No user row, no team row.**
3. **Pay** — the embedded payment element (unchanged; Link still desktop-only) charges the $200.
4. **Finalize** — on Stripe confirming, the browser calls `POST /api/public/team-registrations/finalize` `{ paymentIntentId }`:
   - Verify the PI `succeeded` and `kind === "team_deposit_pending"`.
   - **Idempotent**: if a team already exists for this PI (`deposit_payment_intent_id`), return it.
   - Create the user (`upsertGuestUser` from metadata, or use `captainUserId` if authed), the `team_registration` (teamFeeCents from metadata, discountCodeId/discountCents applied, `captainStripeCustomerId`, `captainPaymentMethodId`, `backstopStatus: "pending"`, `deposit_payment_intent_id`), the membership, record discount usage, and — for a new guest — a session (log them in).
   - Return `{ inviteToken, joinUrl }` → client advances to the team HQ ("ok") screen.
5. **Webhook backstop** — `payment_intent.succeeded` for `team_deposit_pending` runs the same `finalizeTeamDeposit(pi)` core (shared with the endpoint), idempotently creating user+team **without** a session (a webhook can't set a cookie). If the browser finalize fails, the team still exists; the captain signs in later to find it.

Shared core `finalizeTeamDeposit(pi)` used by both the endpoint and the webhook guarantees exactly one team per PI (unique `deposit_payment_intent_id`, first writer wins).

## Discount

- Validated client-side against the season via the existing `/api/public/validate-discount`; shown in the breakdown; carried into the PI metadata by `prepare`; applied at finalize when the team is created.
- **Over-large guard** (client + server): a code may take at most `effectiveTeamFee − $200` off. If larger → *"A $200 deposit is always due today, so a code can take at most $X off this team. This one's larger than that."* The deposit is never reduced.
- The `POST/DELETE /api/public/team-registrations/[token]/discount` endpoint from #466 is **removed** (there is no team to mutate pre-payment). Its API test is repurposed to cover discount-at-finalize.

## Wayfinding

Details + payment merge, so the team flow collapses from 4 steps to **3**: `Reserve` (required) → `Register yourself` (required) → `Invite roster` (optional). `register-experience` `TEAM_STEPS` and the `team-create` step reporting update accordingly.

## Schema

Add `team_registrations.deposit_payment_intent_id varchar(255)` with a unique index (idempotent finalize/webhook dedupe). `discount_code_id` / `discount_cents` (from #466) are reused. Additive migration.

## Files

- `src/components/registration/team-create.tsx` — rewrite step 1+2 into the one page; email-check + sign-in gate; prepare → inline payment → finalize.
- `src/components/registration/register-experience.tsx` — `TEAM_STEPS` → 3 steps.
- `src/pages/api/public/team-registrations/prepare.ts`, `finalize.ts`, `email-check.ts` — new.
- `src/lib/registrations/finalize-team-deposit.ts` — shared finalize core (endpoint + webhook).
- `src/lib/stripe/handle-team-deposit-*` / webhook router — handle `team_deposit_pending`.
- `src/pages/api/public/team-registrations/index.ts` — retire or repoint the eager-create path.
- `src/pages/api/public/team-registrations/[token]/discount.ts` — remove.
- `src/lib/db/schema/team-registrations.ts` + migration.

## Testing

- API: `prepare` (new vs existing email, discount, over-large), `finalize` (creates once, idempotent, session for guest), webhook idempotency. Reuse the seeded `E2ETEAM10` code.
- E2E/manual: full reserve on **staging** (Stripe test mode, card `4242…`) — new captain, existing-email sign-in, discount, abandon-then-return (no account created).
- Unit: over-large discount guard.

## Risks

Payments + auth change. Build + verify entirely on staging before merge; owner cut-checks staging. Webhook/finalize idempotency is the critical correctness property — test both orderings (browser-first, webhook-first).

## Out of scope

Solo flow (issue #467). Youth/COPPA path untouched.
