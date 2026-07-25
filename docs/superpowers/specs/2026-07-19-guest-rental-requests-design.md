# Guest rental requests + account-at-payment — design

**Date:** 2026-07-19
**Branch:** `feat/rentals-guest-request` (worktree off `main`, includes the inline-selectors fix)
**Scope:** Both brands (shared rental request flow). Builds on request→approve→pay (#419), per-player waivers (#421).

## Problem

Today a visitor must **sign in before they can even submit a rental request**: `FieldCalendar` shows a "Sign in to request" CTA, and `POST /api/rentals/bookings` returns 401 for guests. Requiring an account up front to request a field is a conversion killer.

## Goal (decided in brainstorming — "Option A")

A **guest submits a rental request with no account** (name, email, phone + waiver acceptance). The account is created **at payment**, after approval: the approval email links to a **claim page** where the guest creates an account (or signs in), which **claims** the pending booking (links it to their new user) and drops them into the existing dashboard pay + roster/waiver flow — unchanged from there.

Signed-in users book exactly as today.

## Non-goals

- Fully account-free payment/management (that was the rejected "Option B").
- An optional "create an account now" nudge on the request-confirmation screen (possible later enhancement; v1 creates the account at payment only).
- Changing the approve/decline mechanics, Stripe, pricing, or the per-player waiver system itself — only who can *reach* them and how a guest booking gets attached to an account.

## Architecture

### 1. Request UI — `FieldCalendar.tsx`
- Remove the `needsSignIn` sign-in gate.
- The page tells the component whether the visitor is signed in: `rent.astro` passes `signedIn={!!Astro.locals.user}` (and, when signed in, the user's name/email to prefill/skip the guest fields). Aspire's `RentalBooking` gets the equivalent.
- **Guest (not signed in):** show contact fields in the request panel — **Full name** (required; doubles as the waiver signer name), **Email** (required, valid), **Phone** (optional) — alongside the existing waiver-acceptance checkbox. Submit includes these.
- **Signed in:** no contact fields; use the account (as today).
- On success, the "Request submitted" confirmation is unchanged (copy already says we'll email a pay link).

### 2. Booking endpoint — `POST /api/rentals/bookings`
- Remove `if (!locals.user) return 401`.
- **Signed-in path:** unchanged (renterUserId = user.id, renterEmail = user.email).
- **Guest path:** validate body `renterName` (non-empty), `renterEmail` (valid, ≤320), `renterPhone` (optional, normalized); store `renterUserId = null`, `renterName`, `renterEmail`, `renterPhone`. The waiver name = renterName.
- **Rate-limit guest submissions** by IP (public unauthenticated write — mirror `futsal-interest`/`corporate-inquiry`: `rateLimit(\`rental-request:ip:${ip}\`, …)`).
- Keep all existing validation (waiver required, slot/lead-time/window, pricing, conflict → 409).
- The request-received email already dispatches to `renterEmail`, so guests are notified with no change.
- Note: `GET /api/rentals/bookings` ("my rentals") stays authed (401 for guests) — a guest has no dashboard list until they claim.

### 3. Approval → claim link — `PATCH /api/admin/rentals/[id]` (approve) + messaging
- On approve of a **guest** rental (`renterUserId == null`):
  - Paid (>$0 → `pending_payment`): mint a **`rental_claim`** self-serve token (targetId = rental id; reuse `self_service_tokens` + a new kind) and set the approval email's pay link to **`{APP_URL}/rentals/claim/{token}`** instead of `/dashboard/bookings`.
  - $0/comp → `confirmed`: the confirmation email includes a claim link too (so the guest can create an account to add players/waivers), but no payment step.
- On approve of a **signed-in** rental: unchanged (email links to `/dashboard/bookings`).
- `dispatchRentalRequestApproved` / `dispatchRentalConfirmation` gain a `payUrl`/`claimUrl` that is the claim link for guests, the dashboard for users. (Extend the existing dispatchers to compute the right URL from whether `renterUserId` is null + mint/lookup the claim token.)

### 4. Claim page + endpoint — `/rentals/claim/[token]`
- `src/pages/rentals/claim/[token].astro` (SSR): verify the token (`rental_claim`, unconsumed, unexpired) → load the rental.
  - **Token invalid/expired/consumed:** friendly page — "This link has expired. Contact the venue." (link/phone).
  - **Already claimed** (rental.renterUserId set): if the signed-in user owns it → redirect to `/dashboard/bookings`; else a neutral "already claimed" message.
  - **Signed in (unclaimed):** claim immediately (set renterUserId = user.id) → consume token → redirect to `/dashboard/bookings`.
  - **Not signed in:** render a **claim form** — "Create your account to pay and manage your booking." Email is **prefilled from `rental.renterEmail` and read-only** (the token proves ownership); Name prefilled from `renterName`; a password field. Plus an "Already have an account? Sign in" path.
- `POST /api/rentals/claim/[token]`:
  - Validate the token → rental (must be unclaimed).
  - **Create-account path:** create a Lucia user with `email = rental.renterEmail`, `emailVerified = true` (the token IS the email-ownership proof — no verification round-trip), the submitted password + name; if a user with that email already exists, reject with "account exists — sign in instead."
  - **Sign-in path:** authenticate the provided credentials.
  - Then **claim**: set `field_rentals.renterUserId = user.id` for this rental (and any `field_rental_players` requester row's ownership if applicable); consume the token; create a session; return success → client redirects to `/dashboard/bookings` (to pay).
  - Reuse the existing auth/session + user-creation utilities (Lucia, password hashing) — do not hand-roll.
  - Rate-limit by IP (public auth endpoint).
- Security: the **claim token is the capability** (emailed to the requester's address). Email is locked to the rental's email so a claimant can't attach the booking to a different identity. No email-match auto-claim (avoids spoofing).

### 5. Downstream — unchanged
Once `renterUserId` is set, `/dashboard/bookings` pay ("Pay now"), the players & waivers panel, per-player waiver signing, and reminders all work exactly as built — they key off `renterUserId`.

### 6. Aspire parity
`RentalBooking.tsx` (Aspire) gets the same guest-fields treatment + `signedIn` prop; the shared endpoint + claim flow cover both brands.

## Tests
- **API:** `POST /api/rentals/bookings` as a guest → `requested` with renterUserId null + contact stored; validation (missing name/invalid email → 422); rate-limit; signed-in path still works. Approve a guest rental → mints a `rental_claim` token + email carries the claim URL. `POST /api/rentals/claim/[token]`: create-account → user made (email verified), rental claimed (renterUserId set), token consumed, session created; existing-email → rejected; sign-in path claims; invalid/expired/consumed token → 4xx; claiming an already-claimed rental → guarded.
- **Unit:** guest request body validation; the claim-URL-vs-dashboard decision.
- **E2E (Aspire, localhost-verifiable):** guest fills the request form on `/rentals` (no sign-in) → "Request submitted". (Claim/pay E2E optional — controller browser-check.)

## Risks / notes
- **Auth is shared infra** — reuse Lucia user-creation + session helpers; the email-pre-verified account creation is the one sensitive new path (gated strictly by the claim token). Get the token check right (unconsumed + unexpired + rental unclaimed) before creating any user or session.
- **Schema:** field_rentals already supports guests (nullable renterUserId + contact columns); only a new `self_service_token_kind` value `rental_claim` is added (idempotent enum add, isolated per the 55P04 lesson — migration applied to staging by the controller, prod on merge).
- **Both brands** via the shared endpoint; SoccerOne can't be browser-verified on localhost (301 to prod) — Aspire `/rentals` is verifiable and is where the E2E runs.
- **Idempotency:** a duplicate approval (or resend) must not mint conflicting claim tokens (reuse the unconsumed token, like `mintToken` already does).
- **Existing-account guests:** a guest whose email already has an account is told to sign in (then claim) rather than silently creating a duplicate.
