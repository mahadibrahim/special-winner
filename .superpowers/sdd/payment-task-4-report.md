# Task 4 report: one-shot payment reminder

## Summary

Shipped `sendDuePaymentReminders` (new `src/lib/dropin/payment-reminder.ts`),
`dispatchPaymentReminder` (new export in `src/lib/dropin/messages/dispatch.ts`,
backed by a new `renderPaymentReminder` in
`src/lib/dropin/messages/payment-reminder.ts` and a new branded email
template), and wired the reminder pass into `/api/cron/expire-pending-claims`
to run BEFORE the expiry sweep. `reminderSentAt` (already added to the schema
by Task 1) is stamped in a single `UPDATE ... RETURNING` before any send is
attempted, so the claim IS the atomicity boundary — no separate check-then-
send-then-stamp window exists for a crash to land in.

## Files changed

- `src/lib/dropin/payment-reminder.ts` (new) — `sendDuePaymentReminders(now?)`:
  selects `pending_payment` rows with `reminderSentAt IS NULL` and
  `promotionExpiresAt` in `(now, now+30min]`, stamps `reminderSentAt` in the
  same `UPDATE ... RETURNING`, then for each stamped row resolves the
  self-serve link and calls `dispatchPaymentReminder` via `awaitDispatch`
  (logged-not-thrown, mirrors `promotion.ts`'s `promoteNextWaitlister` call
  site).
- `src/lib/dropin/messages/dispatch.ts` — new `dispatchPaymentReminder(bookingId, selfServeUrl, expiresAt)`, structured identically to `dispatchWaitlistPromoted` (load booking → session → user → build context → render → dispatch on one channel).
- `src/lib/dropin/messages/payment-reminder.ts` (new) — `renderPaymentReminder(ctx)`: builds the SMS/email/Telegram variants. SMS body is the brief's copy verbatim: `"Your spot for {session label} is held until {time in venue tz}. Complete payment to keep it: {link}"` (with a `[Aspire]`/`[SoccerOne]` brand prefix, matching the other renderers' convention).
- `src/lib/dropin/messages/types.ts` — new `PaymentReminderContext extends DropInBaseContext { expiresAt: Date; selfServeUrl: string }`.
- `src/lib/email/templates/dropin-payment-reminder.tsx` (new) — `DropInPaymentReminderEmail`, built from the shared `EmailLayout`/`StatusBanner`/`DetailPanel` components, same shape as `DropInWaitlistPromotedEmail`.
- `src/pages/api/cron/expire-pending-claims.ts` — calls `sendDuePaymentReminders()` before `expireOverduePromotions()`; doc header, log line, and `GET` description text updated; response now spreads both result objects (`reminded` + the existing `expired`/`expiredPaymentHolds`/`promotedNext` fields — no key collisions).
- `tests/api/cron/payment-reminders.test.ts` (new) — 5 tests (see Test results).

## Self-serve link derivation (token-reuse decision)

**Decision: reuse via `mintToken`'s existing dedupe, no hand-rolled lookup.**
`mintToken` (`src/lib/check-in/tokens-db.ts:33-72`) already implements
"reuse if a live (unconsumed, unexpired) token exists for this
`(kind, targetId)`, else mint" as its *entire* top-level behavior — it does
the `SELECT ... WHERE kind = ? AND targetId = ? AND consumedAt IS NULL AND
expiresAt > now ORDER BY createdAt DESC LIMIT 1`, returns it if found, and
only inserts a new row otherwise. `walkin/start.ts` mints the token with
`kind: "walkin_session", targetId: booking.id, ttlHours: 2` — the exact same
2h TTL as `WALK_IN_HOLD_TTL_MS`. Since the reminder only fires when
`promotionExpiresAt` is within the hold's final 30 minutes, the original
token (minted at hold creation, same 2h clock) is essentially always still
live at reminder time. So `payment-reminder.ts`'s `selfServeUrlForBooking`
just calls `mintToken` again with the same `(kind, targetId)` — the reuse
path is guaranteed to hit in the ordinary case, and the mint-fresh fallback
only matters if the original token was somehow already consumed (shouldn't
happen while the booking is still `pending_payment` — consuming happens at
self-serve completion, which flips the booking away from `pending_payment`)
or expired early. Writing a separate "look up the tokens table first" branch
would have duplicated `mintToken`'s own logic for no behavioral gain — the
helper already *is* the reuse-or-mint check the brief asked for. Documented
inline in `payment-reminder.ts`'s module header.

One judgment call on the fresh-mint fallback: `sentVia` is a required field
on `MintTokenInput` with no "system"/"cron" value in the
`self_service_send_channel` enum (`email | sms | qr | kiosk_search |
customer_dashboard`). Used `"kiosk_search"` — keeps the token's provenance
tag consistent with the walk-in flow it belongs to. This is effectively dead
code in normal operation (see above), so the choice is low-stakes; flagging
in case a future case makes the fallback path reachable more often.

## Index decision: skipped, documented

Per the plan amendment's explicit menu (skip vs. a predicate that avoids the
new enum values), **skipped adding any new index**. Reasoning:

- The precedent index (`drop_in_bookings_promotion_expiry_idx`) is
  predicated on `status = 'pending_claim'` — an enum value that existed
  before this PR. A same-shaped index for the reminder query would need
  `WHERE status = 'pending_payment'`, and `pending_payment` is a *new* enum
  value added by this PR's own migration `0084`. Per Task 1's empirically-
  verified finding (all pending migrations in a PR run in one transaction on
  a from-scratch DB), a `CREATE INDEX ... WHERE status = 'pending_payment'`
  in a new migration file in this same PR would hit the identical "unsafe
  use of new enum value in the same transaction it was added in" failure
  CI hits for any other same-PR use of the value.
- The only enum-value-free alternative the amendment offered
  (`WHERE reminder_sent_at IS NULL` alone) is a poor index: `reminder_sent_at`
  is `NULL` for every booking of every status forever, except the small
  sliver of `pending_payment` holds that have been through this pass. A
  partial index on that predicate alone would cover nearly the whole table
  indefinitely — no better than a full scan, plus write-amplification on
  every booking insert/update.
- Row-count reasoning for skipping entirely: `pending_payment` rows are
  walk-in kiosk holds with a 2-hour lifetime, cancelled or confirmed well
  before accumulating at any real scale (per-venue, per-day walk-in volume
  is low — this is a front-desk kiosk flow, not bulk online checkout). The
  reminder query's `WHERE status = 'pending_payment' AND ...` runs against
  `drop_in_bookings_session_status_idx` (existing, on `(sessionId, status)`)
  or a sequential scan filtered to a tiny row subset either way — fine at
  this scale, same reasoning Task 1's report already flagged as the
  deferred-index candidate.

No new migration file was needed for this task — `reminder_sent_at` was
already added to the schema by Task 1's `0084`.

## Verification environment

Same blocker as Tasks 2/3: the shared staging DB lacks migration `0084`.
Stood up a disposable local Postgres 14 (homebrew `initdb`/`pg_ctl`, scratch
data dir, socket in `/tmp` — the scratchpad path is too long for a Unix
socket, matching Task 3's finding), ran `db:migrate:bootstrap` + `db:migrate`
(clean 0000–0084) + `db:seed:e2e`, then ran the dev server on port 4325 via
the same env-nesting workaround (`./scripts/with-bws.sh env DATABASE_URL=...
E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=... npm run dev -- --port
4325`). Postgres + server torn down after verification.

## What I found re: "do sends fail soft in this dev environment"

**They do not fail soft here** — `./scripts/with-bws.sh` injects real
`RESEND_API_KEY` and Twilio/Zernio credentials from Bitwarden (confirmed via
a one-off `node -e` check through the same wrapper). Test-fixture users get a
real (but fake, `@t.example`) email address and no phone number, so
`resolveChannelOrder` picks the `email` channel, and `deliverOnce` actually
calls Resend's API with a live key — Resend accepts the send request (no
real inbox receives it, but it's a genuine outbound network call, not a
no-op). This matches the **existing, established** pattern already in
`tests/api/dropin/expire-payment-holds.test.ts`'s waitlist-promotion
regression test, which calls `processCancelRefund` →
`promoteNextWaitlister` → `dispatchWaitlistPromoted` completely unmocked in
the same environment — I did not invent a new risk here, I followed the
house pattern that was already running real sends. No provider mock or
`R2_MOCK`-style env guard exists for email/SMS dispatch in this codebase (I
grepped `dispatchWaitlistPromoted`/`dispatchBookingConfirmation` usages in
`tests/` and found none). Given that, **asserting `reminderSentAt` is the
correct and only test contract regardless of send outcome** — it's stamped
before the send is attempted, so it's true whether the send succeeds,
soft-fails, or hard-fails (all three are `awaitDispatch`-caught and never
roll back the stamp). None of my tests assert anything about actual message
delivery.

## Test results

- `npx tsc --noEmit` — clean, 0 errors.
- `tests/api/cron/payment-reminders.test.ts` (new) — **5/5 pass**:
  1. Hold expiring in 20 min → cron → `reminderSentAt` set.
  2. Hold expiring in 2h (`WALK_IN_HOLD_TTL_MS` out) → cron → not reminded.
  3. Exactly-once: same hold reminded across two consecutive cron calls —
     `reminderSentAt` timestamp identical after both.
  4. A row with `reminderSentAt` pre-set (simulating "already reminded") is
     left untouched by a subsequent cron call.
  5. `GET` still describes the endpoint (now mentions "payment") without
     sending.
- `tests/api/cron/` (all 10 files, including the new one) — **all pass**.
- `tests/api/dropin/` (all 9 files, including Task 3's
  `expire-payment-holds.test.ts`) — **all pass**, confirms the reminder pass
  landing before the expiry pass didn't regress Task 3's branches.
- `tests/api/kiosk/walkin.test.ts` — **13/13 pass** (unaffected — this task
  didn't touch `walkin/start.ts` except reading its exported
  `WALK_IN_HOLD_TTL_MS`, already exported by Task 3).
- `tests/api/check-in/walkin-payment-webhook.test.ts` — **6/6 pass**.
- Did not re-run `tests/api/venue-hold-visibility.test.ts` — unrelated to
  this task's files (Task 5's territory, per Tasks 2/3's reports; no new
  regression risk introduced here since nothing in this task touches
  status-filtering surfaces).

## Concerns / follow-ups

1. No provider mock exists for `dispatchWaitlistPromoted`/
   `dispatchBookingConfirmation`/`dispatchPaymentReminder` in this test
   suite — every cron/API test that exercises a dispatch path makes a real
   Resend (and potentially SMS) API call when run with `with-bws.sh`
   injecting real credentials. This is pre-existing (not introduced by this
   task) but worth flagging as a standing gap for whoever eventually adds
   CI-safe provider mocking.
2. `sentVia: "kiosk_search"` on the reminder's fresh-mint fallback path is a
   judgment call with no perfect enum value available — see above. Low
   stakes since the path is effectively unreachable in normal operation.
3. Same standing items from Tasks 2/3's reports apply: `with-bws.sh`
   `DATABASE_URL`-override doc inaccuracy still unfixed; migration `0084`
   still not applied to shared staging (by design, until this branch
   merges).
