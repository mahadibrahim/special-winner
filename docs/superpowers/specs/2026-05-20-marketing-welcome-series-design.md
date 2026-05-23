# Marketing Welcome Series — Design Spec

**Date:** 2026-05-20
**Branch:** `feat/marketing-welcome-series`
**Status:** Approved design — ready for implementation planning

## Problem

New customers complete a registration and receive only transactional email (a
confirmation and a receipt). There is nothing that welcomes them, explains what
Aspire Sports is and why it is different, or nudges them to bring their people.
This was explicitly deferred out of the transactional email overhaul
(`2026-05-20-transactional-email-design.md`) as its own cycle.

## Goal

A short marketing email series — **welcome → story → activation** — that fires
after a customer's first registration, building affinity and driving
word-of-mouth. It is distinct from transactional email: it is promotional, it
is opt-out, and it must never interfere with transactional delivery.

## Scope

**In scope:** a 3-email drip series for first-time registrants, a self-contained
daily cron that enrolls and sends, an opt-out + unsubscribe mechanism, and the
schema to support it.

**Out of scope (v1):**
- A parent-voiced variant — season 1 is downtown adults-only; a parent variant
  is deferred to the Worthington youth launch.
- Nurture email for `newsletter_signups` (footer captures) — a separate, colder
  audience; its own future project.
- A dashboard email-preference center — v1 ships only the unsubscribe link.

## Decisions (from brainstorming)

- **Audience:** first-time registrants only.
- **Voice:** one audience-neutral series — no parent/captain variants.
- **Consent:** opt-out — registration auto-enrolls; every email carries a
  one-click unsubscribe.
- **Arc:** welcome → story → activation.

---

## The sequence

Three emails, audience-neutral, cadence measured in days from enrollment. The
day offsets live in a single config array so they are easy to tune.

| Step | Email | Offset | Purpose |
|---|---|---|---|
| 1 | Welcome | day 2 | "You're part of Aspire" — warm welcome, what Aspire is in a line, what to expect. Day 2 so it does not collide with the day-0 transactional confirmation/receipt. |
| 2 | The story | day 5 | The wedge — neighborhood-anchored, captain-first, social-first; the post-game scene; the founding-cohort identity. Why this league is different. |
| 3 | Activation | day 10 | Bring your people — recruit teammates/friends, the season-relevant CTA (e.g. the founders' tournament / form your team). |

**Content authoring:** the implementation ships **draft copy** for all three
emails. Final marketing copy is a founder deliverable to review and approve
before the series goes live, per the ops content-approval rule. The system is
built independently of the exact words.

---

## Trigger & send mechanism

A single new daily cron, `POST /api/cron/send-welcome-series`, plus a Netlify
scheduled function — mirroring the existing `send-balance-reminders` cron and
`scheduled-send-balance-reminders.ts` exactly. **No changes to the Stripe webhook
or registration code paths** — enrollment is derived by the cron.

Each cron run does two passes:

1. **Enroll.** Find every user who has at least one `confirmed` registration and
   whose `welcome_series_enrolled_at` is null; stamp `welcome_series_enrolled_at
   = now()`. Enrollment day is therefore the cron-run day on which the user is
   first observed to have a confirmed registration — within 24h of the actual
   confirmation, which is fine for a day-2/5/10 cadence.

2. **Drip.** For each enrolled user who is not opted out, for each sequence step
   whose day offset has elapsed since `welcome_series_enrolled_at` and which has
   no matching `email_logs` row, render and send that email and log it.

Idempotent and self-healing: re-runs are safe because each step is gated on the
absence of its `email_logs` row (the same pattern the balance-reminder cron
uses). Authentication is the `x-cron-secret` header, matching the other crons.

**Alternative considered — Resend Broadcasts/Audiences.** Rejected: it would
split email content out of version control and spread opt-out logic across two
systems. The existing cron + React Email templates + `email_logs` stack already
does drip cleanly.

---

## Schema

Additive only — one Drizzle migration. Two nullable columns on `users`:

- `welcome_series_enrolled_at timestamp` — set once, by the cron's enroll pass.
- `marketing_opted_out_at timestamp` — null means subscribed; set by the
  unsubscribe endpoint.

No new table. Per-step send progress is tracked through `email_logs` with
`emailType` values `welcome_series_1`, `welcome_series_2`, `welcome_series_3` —
the established progress-tracking pattern.

---

## Consent & unsubscribe

- **Opt-out model.** Enrollment is automatic; `marketing_opted_out_at` stays
  null until the user unsubscribes.
- **Every welcome-series email** includes a one-click unsubscribe link in the
  body **and** a `List-Unsubscribe` (+ `List-Unsubscribe-Post`) header so Gmail
  and Apple Mail render their native one-click unsubscribe.
- **Unsubscribe endpoint:** `GET /api/marketing/unsubscribe?token=<token>`. The
  token is an HMAC of the user id signed with a server secret — no DB token
  table. A valid token sets `marketing_opted_out_at = now()` and renders a small
  confirmation page; an invalid/garbage token renders a graceful error. A
  `POST` form of the same route handles the `List-Unsubscribe-Post` one-click.
- **Scope.** The opt-out gates marketing only. `sendTransactionalEmail` and the
  transactional senders never read `marketing_opted_out_at`; only the
  welcome-series cron does. A user who unsubscribes mid-sequence receives no
  further steps but continues to get all transactional email.
- **Send path.** Welcome-series emails do not use `sendTransactionalEmail`. They
  render via `renderEmail` and send via the low-level `sendEmail`, which must be
  extended to accept optional custom `headers` (for `List-Unsubscribe`). Each
  send is written to `email_logs` like every other email.

---

## Components / file structure

**New:**
- `src/pages/api/cron/send-welcome-series.ts` — the daily cron endpoint.
- `netlify/functions/scheduled-send-welcome-series.ts` — the daily scheduler.
- `src/lib/marketing/welcome-series.ts` — the sequence config (step offsets +
  `emailType` names) and the pure step-selection logic.
- `src/lib/marketing/unsubscribe-token.ts` — HMAC token sign/verify.
- `src/lib/email/templates/welcome-1-welcome.tsx`,
  `welcome-2-story.tsx`, `welcome-3-activation.tsx` — the three templates,
  reusing the `email-layout` primitives (no `StatusBanner` — not status emails).
- `src/pages/api/marketing/unsubscribe.ts` — the unsubscribe endpoint.
- `src/pages/marketing/unsubscribed.astro` — the confirmation page (or rendered
  inline by the endpoint; decided in the plan).

**Modified:**
- `src/lib/db/schema/users.ts` — two new columns.
- `src/lib/email/index.ts` — `sendEmail` / `EmailOptions` gain an optional
  `headers` field.
- `src/lib/email/send.ts` — a `sendWelcomeSeriesEmail` helper (render + headers +
  `email_logs`), kept separate from the transactional senders.
- `package.json` — `MARKETING_UNSUBSCRIBE_SECRET` noted in `.env.example` if a
  new env var is used (or reuse an existing server secret — decided in the plan).

## Data flow

Daily scheduled function → `POST /api/cron/send-welcome-series` → enroll pass
(stamp `welcome_series_enrolled_at`) → drip pass (per user, per due step:
`renderEmail` → `sendEmail` with `List-Unsubscribe` header → `email_logs`).
Unsubscribe link in each email → `/api/marketing/unsubscribe` → set
`marketing_opted_out_at` → confirmation page.

## Error handling

- A failed send is logged to `email_logs` with `status = "failed"` and never
  blocks the rest of the cron run (per-user try/catch, as in the balance-reminder
  cron).
- The cron returns a per-step sent/skipped/errored breakdown.
- An invalid unsubscribe token renders a graceful error page, not a 500.

## Testing

- **Unit** (`tests/unit/`): the pure step-selection logic (given
  `welcome_series_enrolled_at`, `marketing_opted_out_at`, the set of sent
  `emailType`s, and "today", return which steps are due); unsubscribe-token
  sign/verify round-trip and tamper rejection.
- **API** (`tests/api/`): the cron — enrolls a confirmed-registration user,
  sends step 1/2/3 at the correct offsets, skips opted-out users, is idempotent
  on re-run; the unsubscribe endpoint — valid token sets the flag, invalid token
  is rejected, and a transactional send still goes out to an opted-out user.
- **Build** + a render check of the three templates.

## Rollout notes

- Schema change is additive; ships with a generated Drizzle migration.
- The new scheduled function needs `CRON_SECRET` in the Netlify env (already set).
- Final marketing copy must be founder-approved before the series is enabled.
