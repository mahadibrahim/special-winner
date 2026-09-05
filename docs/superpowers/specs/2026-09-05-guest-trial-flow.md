# Guest Trial Flow — Design Spec (approved & implemented)

**Status:** APPROVED 2026-09-05 (owner). Decisions: (1) GO on the inline
guest flow; (2) existing emails get a sign-in link, never a booking;
(3) repeat-trial guards = org-wide kid name+DOB trial dedupe + daily
per-IP cap + Turnstile on the guest form. Implementation plan:
`docs/superpowers/plans/2026-09-05-guest-trial-flow.md`. Implemented on
feat/youth-guest-trial.

**Problem (Youth UX audit finding #1):** a signed-out parent who clicks
"Book a free trial" on `/youth/classes` is hard-bounced to magic-link
sign-in (`trial-booking.tsx` stashes the template id and redirects to
`/signin?redirect=…`). That is the highest-friction moment in the trial
funnel: a cold parent must leave the page, open email, click a link, and
return before they can even see the booking form. #625 made the round-trip
resume reliably, but the round-trip itself remains. This spec replaces the
bounce with an inline guest path: email + kid + waiver inside the modal.

## What exists (verified 2026-09-05)

- `POST /api/classes/book` is 401-gated; `POST /api/dropin/guest-checkout`
  hard-rejects `kind === 'class'` ("no child concept"). No guest door today.
- `upsertGuestUser` (shared by both guest checkouts): users row with
  `passwordHash: null`, `emailVerified: false`, canonical-email dedupe,
  `parent` role grant on create. Session cookie is set **only if
  `wasNewUser`** — the account-takeover rule, uniform across guest flows.
- `resolvePerson({ kind: "dependent", parentUserId, … })` creates/dedupes
  the kid row; **kid DOB is required** on the dependent path (schema-level:
  `family_members.birth_date` nullable only for self rows).
- `createChildClassBooking` (book-child.ts) already does everything after
  the kid exists: session lock, `status='scheduled'` + future gate, age
  gate, duplicate guard, member-child-no-trial, one-trial-ever, waiver
  ask/record (`recordLiabilityWaiver`, guardian variant), locked capacity
  check, single `drop_in_bookings` row (`paymentMethod: 'trial'`),
  `ensureDropInCustomerMembership`, confirmation email.
- COPPA plumbing: `family_members.parental_consent_given_at/by/ip` audit
  columns (currently written by no flow — the `/api/family-members`
  endpoint enforces the checkbox via Zod but does not stamp them);
  `consents.type='parental'` rows are written by registration guest
  checkout. Kiosk walk-in (`walkin/start.ts`) is the precedent for
  unauthenticated create-parent + create-kid + book-class.
- Unverified-user sweeper is safe: it skips users with `user_roles`,
  `family_members`, or `drop_in_bookings` rows — a guest-trial parent has
  all three.

## Proposed design

### Client — `trial-booking.tsx`

Signed-out `openForTemplate` no longer redirects. New phases:

1. `guest_form` — parent email, kid first/last name, kid DOB, and the
   affirmative COPPA parental-consent checkbox (same copy as
   `add-dependent-form.tsx`: "Required by federal law (COPPA) for
   participants under 13"). A quiet "Already have an account? Sign in"
   link keeps the old magic-link bounce (and #625's resume) as the escape
   hatch.
2. `guest_waiver` — the existing waiver panel (guardian variant,
   `DROPIN_WAIVER_TEXT`, signer name), shown unconditionally: a guest by
   definition has no waiver on file, so we skip the attempt→422→prompt
   round trip and submit everything in one request.
3. Submit → `POST /api/classes/guest-trial`. On `booked` → existing
   `success` phase (the Lucia cookie set by the endpoint means the parent
   is now signed in — nav/auth state will pick it up on next fetch). On
   `existing_account` → new confirmation panel: "You already have an
   account — we've emailed you a sign-in link. Your trial pick is saved."
   (sessionStorage `youth:trial-pending` already resumes same-device.)
4. Full/blocked errors reuse the existing offer/blocked branches.

Signed-in behavior is untouched.

### Server — new `POST /api/classes/guest-trial`

Public, org-scoped (`locals.organization` required), rate-limited
(5/min/IP, the newsletter pattern). Body: `sessionId`, `email`,
`child { firstName, lastName, birthDate }`, `parentalConsent: literal
true`, `waiver { signedBy, consentText }` (required — no waiver, 422 up
front). IP/user-agent from request context, never the body.

1. `upsertGuestUser(email)`.
2. **`wasNewUser === false` → do not book** (Decision 1 below): mint a
   login magic link (`purposeContext.redirectTo:
   "/youth/classes?trial=<templateId>#schedule"`), send the
   existing-account email (rate-limited 1 per 10 min per user, the
   registrations guest-checkout pattern), return `{ status:
   "existing_account" }`. No child PII is ever written to an account the
   requester hasn't proven they control.
3. `wasNewUser === true` →
   - `resolvePerson({ kind: "dependent", parentUserId: user.id, … })`;
   - stamp `parental_consent_given_at/by/ip` on the row + write the
     `consents` type `parental` row (gated on `hasActiveConsent`, matching
     registration guest checkout) — this makes guest-trial the first flow
     to fill the COPPA audit columns, deliberately;
   - `createChildClassBooking({ …, kind: 'trial', waiver })` — all gates
     reused verbatim;
   - create the Lucia session (new user only), send the magic-link welcome
     email (`sendMagicLinkLoginEmail`) so the account survives the 1-hour
     unverified session window.
4. Error map mirrors `/api/classes/book` (`session_full` 409,
   `age_ineligible` 422, etc.). A booking failure after user+kid creation
   leaves those rows in place (same tolerance as kiosk walk-in — the
   parent can retry, dedupe absorbs the re-submit).

### Analytics (YOUTH_EVENTS additions, no PII)

- `trial_guest_form_shown { template_id }`
- `trial_guest_submitted { template_id }`
- `trial_guest_existing_account { template_id }`
- Existing `trial_booked` / `trial_blocked{reason}` fire as today.

### Repeat-trial guards (owner decision 2026-09-05)

1. **Kid-identity dedupe** — before granting a trial, `book-child.ts` also
   matches case-insensitive kid name + exact DOB against any non-cancelled
   trial booking in the org, across all accounts. Same kid under a burner
   email → `trial_already_used`. Applies to signed-in bookings too.
2. **Daily per-IP cap** — ~3 guest trials per IP per day, on top of the
   5/min burst limit.
3. **Turnstile** on the guest form (existing widget + `verifyTurnstile`;
   sandbox keys fail open in dev, fail closed in prod).

### Accepted risks (flagging, not solving)

- **Residual repeat-trial bypass:** a parent willing to falsify their
  child's name or DOB on a legal consent form can still slip the dedupe.
  Accepted — tiny cohort, $0 stakes, coaches recognize kids in person.
  Watch `trial_booked` vs distinct emails in PostHog.
- **Account-existence oracle:** the `existing_account` response reveals
  that an email has an account. Identical to the registrations
  guest-checkout behavior today; rate limits bound enumeration.
- **Rate limiter is process-local:** `rateLimit()` (`src/lib/auth/rate-limit.ts`)
  keeps its buckets in-memory per Netlify Function instance, not shared
  across instances. Every limit this endpoint relies on — the 5/min burst,
  the 3/day-per-IP cap, and the 1-per-10-min existing-account email gate —
  effectively multiplies by however many cold instances Netlify happens to
  route a given IP/user across. Concretely: a victim whose email is guessed
  at could receive more than one sign-in-link email per 10 minutes if the
  attacker's requests land on different instances. Accepted at current
  launch scale (low traffic keeps instance counts low); the fix is the
  Redis/Upstash-backed limiter already tracked as a post-launch TODO at the
  top of `rate-limit.ts`, which would make these limits correct platform-wide
  rather than per-instance.

## Decision points — RESOLVED (owner, 2026-09-05)

1. **Existing-email submits:** email-a-link, never book. No unauthenticated
   child-PII writes onto an existing account.
2. **Kid PII at guest stage:** approved — kid name + DOB collected in the
   modal, covered by the affirmative COPPA checkbox and audit-column stamps.
3. **Endpoint shape:** new `POST /api/classes/guest-trial` (extending
   `dropin/guest-checkout` rejected: its "no child concept" comment is
   load-bearing; grafting one in touches paid pickup paths for no shared
   win).
4. **Guards:** kid dedupe + daily IP cap + Turnstile (see above).

## Out of scope

- Password setup / email verification UX changes (existing flows cover it).
- The "N spots left" vs "no sessions" card mismatch (separate finding —
  card chip should derive from `nextOpenSession`, tracked independently).
- Trial-convert email changes (`trial-convert.ts` works off the booking
  row and needs nothing new).
