# Transactional Email Overhaul — Design Spec

**Date:** 2026-05-20
**Branch:** `feat/transactional-email-overhaul`
**Status:** Approved design — ready for implementation planning

## Problem

A review of the transactional email system surfaced correctness, delivery, and
presentation problems:

- The balance-reminder cron endpoint exists and is tested but has no scheduler —
  it never fires in production.
- Transactional emails route through the messaging gateway and can be silently
  delivered as SMS instead of email, so a parent who prefers SMS may never
  receive the actual receipt or registration confirmation.
- The waitlist-promotion deadline renders in UTC, not the parent's timezone.
- No email has a plain-text alternative part (deliverability cost).
- Auth emails (signup, forgot-password, verification) bypass `email_logs`.
- Refunds are created via the Stripe API from the admin UI, but there is no
  webhook — a refund issued directly in the Stripe dashboard never reaches the
  app (stale admin tracking, no email), and email/tracking ride on the
  synchronous admin request instead of Stripe's confirmation.
- Assorted template defects: `sectionLabel` misuse, a hardcoded "48 hours",
  stale `password-reset` naming, a `www` logo URL, shallow CTA links, and
  inconsistent subject-line casing.
- The email design can be sharpened to be read faster and convert better.

## Scope

**In scope** — three workstreams, one spec:

1. Transactional email correctness fixes.
2. A Stripe refund webhook with the webhook as the single source of truth.
3. An email design overhaul applied across all 10 templates.

**Out of scope** — the first-registration marketing welcome series. It is a
separate system (consent, multi-step sequencing, scheduled sends, founder
content sign-off) and gets its own spec → plan → implementation cycle next.

---

## Workstream 1 — Transactional email correctness

### 1.1 Channel model

Email is the channel of record. Every transactional type **always** sends the
full HTML email and writes an `email_logs` row. SMS becomes a separate,
**additive** nudge — short, with a link — fired only for time-sensitive types,
and only when the parent has a verified phone. SMS never replaces the email.

Introduce `sendTransactionalEmail()` in `src/lib/email/send.ts` that renders the
template, sends via `sendEmail` (direct Resend), generates the plain-text part
(§1.3), and logs. Retire `sendViaGatewayOrDirect` for transactional sends. The
messaging gateway (`sendToParent`) stays for genuine conversational messaging
(broadcasts, staff replies) — it is no longer in the transactional path.

Time-sensitive types additionally call an SMS nudge helper after the email.

| Email | Email | + SMS nudge |
|---|---|---|
| Registration confirmation | always | — |
| Payment receipt | always | — |
| Refund notification (approved / denied) | always | — |
| Sign-in link, Email verification | always | — |
| Magic-link login (guest checkout) | always | — |
| Payment failed | always | yes |
| Waitlist spot-opened | always | yes |
| Balance reminder | always | yes |
| Announcement | always | keeps current per-org behavior |

### 1.2 Timezone correctness

`formatDate` / `formatDateTime` in `send.ts` take an explicit IANA timezone and
pass it to `toLocaleDateString`. Default `America/New_York`; pass the
org/location timezone where the caller has it. Fixes the waitlist `expiresAt`
rendering hours off in UTC.

### 1.3 Plain-text parts

Every email render also produces a plain-text alternative via
`render(reactElement, { plainText: true })`, passed to `sendEmail` as `text`.
Applies to all 10 templates and the auth emails.

### 1.4 Unified send + logging for auth emails

`signup.ts`, `forgot-password.ts`, and `send-verification.ts` call `sendEmail`
directly today and skip `email_logs`. Route them through the unified send path
so every send is logged. Email types: `sign_in_link`, `email_verification`.

### 1.5 Balance-reminder scheduler

Add `netlify/functions/scheduled-send-balance-reminders.ts` — a Netlify
scheduled function running once daily, POSTing to
`/api/cron/send-balance-reminders` with the `x-cron-secret` and `Origin`
headers. Mirror `scheduled-expire-pending-claims.ts` exactly (it does not import
app lib; it is only the scheduler).

### 1.6 Template-level fixes

- `payment-balance-reminder.tsx`: remove the `sectionLabel={subject}` misuse and
  the dead `subject` const.
- Registration-confirmation waitlist branch: parameterize the hardcoded
  "48 hours" from the real waitlist claim-window config.
- Rename `password-reset.tsx` → `sign-in-link.tsx`, `PasswordResetEmail` →
  `SignInLinkEmail`, prop `resetUrl` → `signInUrl`; update call sites.
- `EmailLayout` `appUrl` default → apex `https://aspiresportsohio.com` (no
  `www`, which 308-redirects).
- Deep-link CTAs: registration-confirmation pending-payment button → the payment
  page; waitlist-promotion button → the registration-completion page — not bare
  `/dashboard`.
- Subject lines: sentence case, no ALL-CAPS prefixes (§3.4).
- Fix the misleading "rather than the gateway" comment in
  `walk-up-registration.ts`.

### 1.7 email-verification template

Retained — the dashboard verification banner still triggers it — but moved onto
the unified send + logging path. No removal.

---

## Workstream 2 — Stripe refund webhook

### 2.1 Webhook handler

Add a handler for the Stripe `charge.refunded` event, wired into the existing
Stripe webhook router and the `stripe_events` dedup ledger.

On `charge.refunded`:

1. Resolve the registration + payment from `charge.payment_intent` (match
   `payments.stripePaymentIntentId`).
2. Read the refunded amount from `charge.amount_refunded`.
3. Update `registrations`: `refundAmountCents`, and `paymentStatus` —
   `refunded` if fully refunded, `partial_refund` if partial.
4. Update the `payments` row: `status = refunded`.
5. Fire the refund-approved email via the unified transactional path (§1.1).
6. Idempotent via the `stripe_events` ledger (event id) plus a guard on whether
   the refund amount is already recorded.

### 2.2 Admin action slim-down

`admin-refund.ts` and the approve path in `/api/admin/refunds/[id].ts`:

- Keep: call the Stripe API to create the refund.
- Record a lightweight "refund processing" marker.
- Remove: the synchronous tracking-field updates and the email send — those move
  to the webhook (§2.1).
- Admin UI shows a brief "refund processing" state until the webhook lands.

### 2.3 Denials stay synchronous

A refund **denial** is an admin decision — no money moves, no Stripe event. The
refund-denied email keeps firing synchronously from the admin action. Unchanged.

### 2.4 Dashboard-initiated refunds

A refund created directly in the Stripe dashboard emits the same
`charge.refunded` event and flows through §2.1 identically — admin tracking and
the customer email stay correct with no extra code path.

### 2.5 Schema

A "refund processing" marker is needed. Prefer an **additive nullable timestamp
column** (e.g. `registrations.refund_initiated_at`) over extending the
`refundStatus` enum, to avoid an enum migration. Final mechanism decided in the
plan after inspecting the current `registrations` schema. Any schema change is
additive and ships with a generated Drizzle migration.

---

## Workstream 3 — Email design overhaul

Applies the approved design direction (validated visually against the
registration-confirmation email) across all 10 templates.

### 3.1 Shared primitives (`email-layout.tsx`)

- **Accent stripe** — a 4px primary-red bar at the container's top edge.
- **`StatusBanner`** — a new full-width strip below the logo. Prop
  `mood: "success" | "warning" | "problem"`, with a leading glyph. Colors drawn
  from existing tokens: success → `sageSoft` / sage, warning → `ochreSoft` /
  ochre, problem → `primarySoft` / primary.
- **`Button`** — full-width block button, sentence case, ~6px radius, larger
  padding and tap target, 15px / weight 600. Keep an outline variant.
- **Remove decorative chrome** — drop the `sectionLabel` / `sectionMeta` meta
  bar from `EmailLayout` and the `§` prefixes from `InfoCard`, `SectionLabel`,
  and the meta cells.
- **Detail panel** — render registration/payment details as a single panel with
  hairline-ruled rows, replacing stacked separate `InfoCard`s.
- **Footer** — warmer copy ("Questions? Just reply — a real person reads it.").

### 3.2 StatusBanner assignment

| Mood | Templates |
|---|---|
| success | registration-confirmation (confirmed), payment-receipt, refund (approved) |
| warning | registration-confirmation (pending payment), registration-confirmation (waitlisted), waitlist-promotion, payment-balance-reminder |
| problem | payment-failed, refund (denied) |
| none | magic-link-login, sign-in-link, email-verification, announcement |

### 3.3 Headlines

Lead with the payoff where it helps — notably registration-confirmation
("{child}'s in for {program}") and waitlist-promotion ("A spot opened up for
{child}"). Transactional records (receipt, refund) keep their plain, literal
headlines. The plan enumerates the final headline for each of the 10 templates.

### 3.4 Subject lines

All subjects sentence case, no ALL-CAPS. The plan provides the full table; the
known offender is the waitlist "ACTION REQUIRED:" prefix → "Action required: a
spot opened for {child}".

### 3.5 Mobile / rendering

Single-column is already in place. Verify the new block button and StatusBanner
render correctly and keep ≥44px tap targets in Gmail, Apple Mail, and Outlook.

---

## Data flow

- **Stripe webhook** → event handler → unified transactional send → Resend +
  `email_logs` (+ optional SMS nudge).
- **Cron** → Netlify scheduled function → cron endpoint → unified send.
- **Admin refund** → Stripe API → `charge.refunded` webhook → unified send.

## Error handling

- Email send failures log to `email_logs` with `status = failed` and never block
  the triggering operation (fire-and-forget with `.catch`, as today).
- The refund webhook is idempotent via the `stripe_events` ledger; failures
  return a non-2xx so Stripe retries.
- An SMS nudge failure must not block or fail the email — independent send.

## Testing

- **Unit** (`tests/unit/`) — timezone formatting; plain-text render produces
  non-empty text; subject-line helpers.
- **API** (`tests/api/`) — refund webhook: idempotency, partial vs. full refund,
  dashboard-initiated path, registration/payment resolution. Confirm
  `send-balance-reminders` tests stay green.
- **Build** — `npm run build`.
- **Visual** — render each template to HTML and eyeball; a small dev script to
  dump all templates is acceptable.
- **Migration** — if a schema column is added, `npm run db:generate` and commit
  the migration.

## Rollout notes

- Schema changes are additive only.
- The new scheduled function depends on `CRON_SECRET` being set in Netlify env
  (already set).
- Resend domain authentication (SPF/DKIM/DMARC) should be confirmed out of band
  — not a code change.

## Open decisions for the plan

- Exact schema mechanism for the refund "processing" marker (preference:
  additive nullable timestamp column).
- Two emails per registration webhook (confirmation + receipt) — kept; the
  receipt is the archival document.
