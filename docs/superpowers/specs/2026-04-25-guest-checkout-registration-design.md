# Guest-checkout registration with magic-link activation

**Date:** 2026-04-25
**Status:** Spec — pending user review
**Owner:** Mahad

## Problem

Today, `/register/[seasonId]` redirects unauthenticated visitors to `/signin`, which links to `/signup`. Parents must create an account before they can see the registration wizard. This is friction at the highest-intent moment of the funnel: a parent who has clicked through to a specific season, but hasn't seen the player/waiver/payment flow yet, must commit to an account first. We lose conversions there.

## Goal

Let an anonymous parent walk the entire registration wizard and pay without creating an account first. After Stripe confirms payment, we silently provision the account and email a magic-link sign-in. Their first authenticated session begins when they tap the link.

## Non-goals

- Removing the existing `/signup` and `/signin` flows. They remain available for users who want them.
- Migrating existing password-based accounts to passwordless. Existing users keep their password.
- Adding a "set a password" prompt during onboarding. That can live in account settings later.
- SMS-based magic links for this flow (the magic-link module supports SMS, but registration confirmation is email-driven and we don't want to ask for phone before payment).

## Decisions

| Question | Choice | Rationale |
|---|---|---|
| Wizard layout | Combined Step 1 with parent fields above child fields | Parents intuitively enter their own info first; minimizes total step count |
| Email collision UX | Inline detect on blur via `/api/auth/check-email`; subcopy swaps to "We'll email a sign-in link to \<email\>" | Same end behavior as silent merge but no support tickets ("why am I getting login emails?") |
| User-record creation timing | Pre-Stripe | `registrations.registeredByUserId` is NOT NULL; the existing flow already creates the registration row before checkout, so this is consistent |
| Password requirement | None for the new flow; `users.passwordHash` left null | Schema already nullable; signin already returns generic error for null-password users |
| Magic-link send trigger | Stripe Checkout `metadata.via_guest_checkout=true` flag set by `/api/payments/create-checkout` when called from the guest path; webhook reads it back. For $0/waitlist (no Stripe), wizard calls `/api/auth/send-magic-link` directly. | Explicit signal beats inferring from `passwordHash IS NULL` — avoids surprising existing password users who came through guest checkout |
| Family-member dedup | Match by `parentUserId + lower(firstName) + lower(lastName) + birthDate` | Avoids duplicating an existing child when an existing user goes through the guest path |
| Logged-in users | Existing flow unchanged; Step 1 collapses to family-member picker | No regression for current users |
| Rate-limit on check-email | Per-IP, 10/min | Limits enumeration; the signal already leaks via signup error message, so this is a small additional surface |

## Architecture

### Pages

- **`src/pages/register/[seasonId].astro`** — drop the `if (!user) return Astro.redirect('/signin?redirect=...')` gate. Pass `user` (possibly null) and `organization` to the wizard.
- **`src/components/registration/registration-wizard.tsx`** — Step 1 splits into two branches by `props.user`:
  - **Anonymous:** parent section (firstName, lastName, email, optional phone) above child section (firstName, lastName, birthDate, gender). Both required to advance. Email blur fires a debounced (400ms) `check-email` call; on collision the subcopy under the email field swaps to "We'll email a sign-in link to \<email\> to finish this registration." No other behavior change.
  - **Logged-in:** the current family-member radio picker + "add new" subform.

### New API endpoints

- **`GET /api/auth/check-email?email=…`** — returns `{ exists: boolean }`. Rate-limited per IP (10/min). Lower-cases the email before lookup. Returns `{ exists: false }` for malformed emails (do not 400, to keep client logic simple).
- **`POST /api/auth/send-magic-link`** — body: `{ userId: string, redirectTo?: string }`. Internal-use, but exposed because the wizard needs to call it from the $0/waitlist branches. Authentication: requires either an active session whose `userId` matches the body, or a recently-created registration row whose `registeredByUserId` matches (last 10 minutes) — this stops random visitors from spamming login emails to arbitrary users. Calls `createMagicLink({ purpose: 'login', purposeContext: { redirectTo } })` and `sendMagicLinkLoginEmail`.
- **`POST /api/registrations/guest-checkout`** — single transactional endpoint. Payload (zod):
  ```
  {
    seasonId: uuid,
    parent: { firstName, lastName, email, phone? },
    child: { firstName, lastName, birthDate (YYYY-MM-DD), gender? },
    registrationType: 'full' | 'deposit',
    waiverSigned: boolean,
    waiverSignedBy: string,
    discountCode?: string,
  }
  ```
  Server logic, in order:
  1. Validate. 400 on schema failure.
  2. Resolve user: lookup `users` by `lower(email)`. If absent, insert (`passwordHash: null`, `emailVerified: false`) and assign the global parent role (mirroring `/api/auth/signup`). Capture `wasNewUser`.
  3. Resolve family member: lookup `family_members` by `parentUserId + lower(firstName) + lower(lastName) + birthDate`. If absent, insert.
  4. Delegate to `createRegistration(...)` (extracted helper, see below). It handles season fetch, status check, capacity/waitlist, dedup of pending-unpaid registrations, and amount-due calculation.
  5. Return `{ registration, requiresPayment, amountDueCents, wasNewUser, userHasPassword: <boolean> }`.

### Refactor: extract registration creation

The current `POST /api/registrations` (`src/pages/api/registrations/index.ts`) has substantial business logic (season fetch, capacity check, waitlist insert, dedup-pending-unpaid, amount-due calc, waitlist-email send). Extract that into:

- **`src/lib/registrations/create-registration.ts`** — pure function `createRegistration({ db, user, familyMember, seasonId, registrationType, waiverSigned, waiverSignedBy, discountCode?, notes? }): Promise<CreateRegistrationResult>` where the result is one of `{ kind: 'created', registration }`, `{ kind: 'resumed', registration }`, `{ kind: 'waitlisted', registration }`, or throws `RegistrationError` with `{ status, message }`.
- Both `/api/registrations` POST and `/api/registrations/guest-checkout` call this helper. No behavior change for the existing endpoint.

### Stripe webhook

`src/pages/api/webhooks/stripe.ts` — in the `checkout.session.completed` handler, after marking the registration paid:

1. Read `session.metadata.via_guest_checkout`. If not `"true"`, skip steps 2–3.
2. Look up the user by `registration.registeredByUserId`. Mint a magic link (`createMagicLink({ userId, purpose: 'login', purposeContext: { redirectTo: '/dashboard?welcome=' + registrationId } })`).
3. Call `sendMagicLinkLoginEmail({ userId, organizationId, registrationId, parentEmail, parentName, magicLinkUrl, expiresAt })`. Failures are logged and do NOT fail the webhook (the registration is still good; the user can hit `/signin` and use forgot-password — see amendment below — as a fallback).
4. Existing payment-receipt and registration-confirmation sends remain unchanged.

### New email template

- **`src/lib/email/templates/magic-link-login.tsx`** — React Email component. Subject: "You're registered — finish setting up your account". Sections: registration confirmed banner; large "Sign in to your account" button (the magic-link URL); small print "This link expires in 15 minutes. You can also set a password later from your account settings."
- **`src/lib/email/send.ts`** — `sendMagicLinkLoginEmail(params)` mirrors the shape of `sendPaymentReceiptEmail`. Logs to `email_logs` table (existing pattern).

### Schema

No new tables. No new columns. `magicLinks` already has `purpose='login'`; `users.passwordHash` is already nullable. The 15-min default expiration for `login` purpose is already set in `magic-link.ts`.

## Data flow

```
Anonymous visitor → /register/<seasonId>
  Wizard Step 1 (parent name+email+phone || child name+DOB+gender)
    Email blur → GET /api/auth/check-email
      collision? subcopy swaps; flow continues unchanged
  Step 2 (waiver) → Step 3 (payment + discount)
  Submit:
    POST /api/registrations/guest-checkout
      upsert user (no password) → upsert family member → createRegistration()
      response: { registration, requiresPayment, ... }
    if requiresPayment:
      POST /api/payments/create-checkout (existing) → Stripe redirect
    else (waitlist or $0-after-discount):
      POST /api/auth/send-magic-link → confirmation page
  Stripe success URL → /dashboard?registered=<id> (no session yet; route is public-friendly)

Stripe webhook checkout.session.completed:
  mark registration paid (existing)
  if session.metadata.via_guest_checkout === "true":
    createMagicLink + sendMagicLinkLoginEmail
  sendPaymentReceiptEmail (existing)
  sendRegistrationConfirmationEmail (existing)

Parent opens email → taps magic link →
  /m/<token> → consumeMagicLink → createSession → redirect to /dashboard?welcome=1
```

## Edge cases and error handling

- **Abandons after Step 1, before payment.** Orphan `users` row (`passwordHash=null`, `emailVerified=false`), orphan family member, orphan `pending` registration. Same shape as today's abandoned-cart problem (already accepted). Cleanup is out of scope for this spec.
- **Typo'd a stranger's email.** Stranger receives the magic-link email + the registration confirmation. The magic link is single-use and 15-min expiring; if the stranger ignores it, no harm. The registration is owned by the stranger's account, but the Stripe charge is on the typo-er's card. This is a documented support-only scenario (manual account merge); not common enough to engineer a guard for at this stage.
- **Email collision with a real existing user (the user picked B).** Registration is created against the existing user, child is deduplicated by name+DOB, magic link is sent (because the Stripe metadata flag fires unconditionally for guest checkout). The existing user gets a one-tap sign-in, regardless of whether they have a password — they don't need to remember it.

- **$0 after discount or waitlist (no Stripe redirect).** Wizard receives `{ requiresPayment: false }` and calls `POST /api/auth/send-magic-link` itself, then shows the existing confirmation step. Auth on that endpoint accepts a fresh registration row owned by the target user (last 10 min) as proof of intent.
- **Logged-in user uses the page.** No `parent` section, no guest-checkout endpoint, no magic-link email. Existing behavior.
- **Rate-limit hit on check-email.** Endpoint returns `{ exists: false }` (fail-open) so the wizard never blocks. The user just won't see the inline collision notice; they'll still successfully complete the flow.
- **Magic-link email send fails after webhook.** Logged. Registration remains good. User can tap "Forgot password" on `/signin`, which already mints a `password_reset_login` magic link via `forgot-password.ts:66-71` — and that purpose's redemption (`/m/[token].ts:55-57`) just creates a session and redirects to `/dashboard`, so it works for passwordless users without modification.

## Testing

### API integration tests (`tests/api/registration-guest-checkout.test.ts`)
- new email → user created, family member created, registration created, response shape correct
- colliding email → existing user reused, family member deduped on match, registration created
- existing user already has registration for season (pending unpaid) → resumed
- existing user already registered (confirmed) → 400 duplicate
- season at capacity → waitlisted
- $0 after discount → `requiresPayment: false`
- invalid seasonId → 404
- malformed payload (missing email, bad birthDate) → 400
- check-email rate limit → 11th request in 60s returns `{ exists: false }`

### Playwright (`tests/registration-guest-flow.spec.ts`)
- Anonymous visit `/register/<seasonId>`. Fill parent + child + waiver + select payment option. Click submit.
- Stripe is mocked via the existing test pattern; assert success URL hit.
- Assert magic-link email queued (read from `email_logs` or whatever the test harness exposes).
- Hit the magic link URL; assert dashboard loads with a Lucia session and the registration is visible.
- Hydration: existing `useHydrationBeacon` + `waitForHydration` patterns apply unchanged.

### Unit (`tests/lib/create-registration.test.ts`)
- Waitlist branch fires when `confirmed` count ≥ `maxParticipants`.
- Resume branch fires when matching pending-unpaid row exists.
- Dedup of confirmed registration → throws `RegistrationError` with status 400.

## File-by-file change list

| Path | Change |
|---|---|
| `src/pages/register/[seasonId].astro` | Remove auth redirect; pass `user`/`organization` to wizard |
| `src/components/registration/registration-wizard.tsx` | Anonymous-vs-authed Step 1 branch; email check-on-blur; collision subcopy; route submit through the appropriate endpoint |
| `src/pages/api/auth/check-email.ts` | New endpoint with per-IP rate limit |
| `src/pages/api/auth/send-magic-link.ts` | New endpoint for $0/waitlist + future re-trigger needs |
| `src/pages/api/registrations/guest-checkout.ts` | New endpoint |
| `src/lib/registrations/create-registration.ts` | New shared helper extracted from existing `/api/registrations` POST |
| `src/pages/api/registrations/index.ts` | Refactor POST to call the shared helper |
| `src/pages/api/payments/create-checkout.ts` | Pass `metadata.via_guest_checkout=true` when caller indicates guest flow |
| `src/pages/api/webhooks/stripe.ts` | If `metadata.via_guest_checkout`, mint magic link and send `sendMagicLinkLoginEmail` |
| `src/lib/email/templates/magic-link-login.tsx` | New React Email template |
| `src/lib/email/send.ts` | `sendMagicLinkLoginEmail` |
| `tests/api/registration-guest-checkout.test.ts` | New |
| `tests/registration-guest-flow.spec.ts` | New Playwright spec |
| `tests/lib/create-registration.test.ts` | New unit tests for extracted helper |

## Rollout

This is purely additive at the route level — the existing `/signup` and `/signin` and `POST /api/registrations` endpoints continue to work unchanged. No feature flag needed; the change goes live the moment it ships. The biggest risk is the registration-creation refactor; the unit + integration tests cover that.

## Open questions

None. All decisions in the table above are locked unless the user requests changes during spec review.
