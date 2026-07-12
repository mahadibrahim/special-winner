# Walk-in Remote Payment + Hold Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the walk-in pay link actually collect payment (self-serve PayCard) and give holds an honest lifecycle (2h TTL, one reminder, auto-release + waitlist promotion). Spec: `docs/superpowers/specs/2026-07-12-walkin-remote-payment-design.md` (committed in Task 1). Closes Tracker P1 39a40b5d-af23-81c5.

**Architecture:** New `pending_payment` status for walk-in holds (status becomes the walk-in/promotion discriminator, retiring the `holdKind` shim from PR #365). PayCard rides the existing kiosk payment rails: `/api/kiosk/[locationSlug]/walkin/payment` creates the PaymentIntent, the existing `handleDropinWalkinPayment` webhook confirms. Expiry + reminder extend the existing promotion cron machinery in `src/lib/dropin/promotion.ts` / `src/pages/api/cron/expire-pending-claims.ts`.

**Tech Stack:** Astro 5 + React 19, Drizzle (additive migration), Stripe PaymentElement (mirror `src/components/kiosk/WalkInWizard.tsx`), Vitest, Playwright.

## Global Constraints

- Git worktree, branch `feat/walkin-remote-payment` (create AFTER the cleanup-batch branch merges; same worktree fine). git via `git -C`; NEVER touch the main checkout. Absolute worktree path in every subagent dispatch.
- Dev server: own port (4324+), `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 ./scripts/with-bws.sh npm run dev -- --port <port>`; API tests `TEST_BASE_URL=http://localhost:<port> ./scripts/with-bws.sh npx vitest run <files>`.
- Schema changes go `db:generate` → review SQL → commit migration (NEVER db:push). New migration must be idempotent (`DO $$ … duplicate_object …` for enum values, `ADD COLUMN IF NOT EXISTS`) per the 0023/0024 pattern.
- Tenant scoping on every admin endpoint touched; `findFirst`/`.limit(1)` need `orderBy`.
- The kiosk payment endpoint is public-by-slug + rate-limited BY DESIGN — do not add auth that would break customer phones; DO prove cross-location booking rejection in tests.
- Status literals: walk-in holds `pending_payment`; waitlist promotions stay `pending_claim`; cancel reason `expired_payment_hold`.
- Copy rule: "pay link" language ships ONLY in this PR together with the working PayCard.
- `npx tsc --noEmit` before every commit; conventional commits.

---

### Task 1: Branch + docs + schema migration

**Files:**
- Copy specs/plan from scratchpad into `docs/superpowers/specs/` + `docs/superpowers/plans/` and commit.
- Modify: `src/lib/db/schema/drop-in.ts` (enum arrays + column)
- Create: generated `src/lib/db/migrations/NNNN_*.sql` (then hand-hardened)

**Interfaces:**
- Produces: `dropInBookingStatusEnum` includes `"pending_payment"`; cancellation-reason enum includes `"expired_payment_hold"`; `dropInBookings.reminderSentAt: timestamp | null`.

- [ ] **Step 1:** Add `"pending_payment"` to the `drop_in_booking_status` enum array (drop-in.ts:37-…) and `"expired_payment_hold"` to the cancellation-reason enum array; add `reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true })` to `dropInBookings`.
- [ ] **Step 2:** `npm run db:generate`; review the SQL; wrap enum additions in the idempotent `DO $$ BEGIN ALTER TYPE … ADD VALUE IF NOT EXISTS … EXCEPTION WHEN duplicate_object THEN null; END $$;` form (Postgres supports ADD VALUE IF NOT EXISTS directly — prefer it) and the column in `ADD COLUMN IF NOT EXISTS`.
- [ ] **Step 3:** Append the backfill to the same migration (idempotent — status filter makes re-runs no-ops):

```sql
UPDATE drop_in_bookings
SET status = 'pending_payment',
    promotion_expires_at = created_at + interval '2 hours'
WHERE status = 'pending_claim' AND promotion_expires_at IS NULL;
```

NOTE: enum values added in a transaction can't be used in the same transaction on old Postgres; drizzle migrations run per-statement — verify the runner's transaction behavior (scripts/db-migrate.ts) and if needed split enum-add and backfill into two migration files (NNNN and NNNN+1).
- [ ] **Step 4:** `npx tsc --noEmit`; run the migration against a scratch/staging-safe target ONLY via CI conventions (do NOT migrate staging manually — CI validates on ephemeral Postgres). Commit.

---

### Task 2: Hold creation + webhook accept `pending_payment`

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/start.ts` (insert status + expiry; comment)
- Modify: `src/lib/stripe/handle-dropin-walkin-payment.ts:67-72` (status guard)
- Test: `tests/api/kiosk/walkin.test.ts` (adjust status expectations), `tests/api/venue-hold-visibility.test.ts` (fixture now pending_payment)

**Interfaces:**
- Produces: walk-in holds are `status: "pending_payment"` with `promotionExpiresAt = now + 2h`. Webhook confirms from either pending status.

- [ ] **Step 1:** walkin/start insert: `status: "pending_payment"`, `promotionExpiresAt: new Date(Date.now() + 2 * 3600_000)`. Update the module comment to describe the real lifecycle (TTL, reminder, sweep).
- [ ] **Step 2:** Webhook guard becomes:

```ts
if (row.status !== "pending_claim" && row.status !== "pending_payment") {
  return { status: "skipped", reason: `booking ${bookingId} in unexpected status ${row.status}` };
}
```

(keep the cancelled/confirmed early-skips above it; the confirm UPDATE already nulls `promotionExpiresAt`).
- [ ] **Step 3:** Grep ALL readers of `pending_claim` (`rg -n '"pending_claim"' src tests`) and disposition each: promotion machinery keeps it; anything that meant "walk-in hold" (event.ts, booking-search.ts, cancel-hold.ts, PickupRollCall/ActivityDetailPanel chips) is handled in Task 5 — list them in your report so Task 5's implementer has the inventory.
- [ ] **Step 4:** Update the two test files' status expectations; run them + `npx tsc --noEmit`; commit.

---

### Task 3: Expiry sweep branch

**Files:**
- Modify: `src/lib/dropin/promotion.ts:126-160` (`expireOverduePromotions`)
- Modify: `src/pages/api/cron/expire-pending-claims.ts` (result plumbing if it reports counts)
- Test: `tests/api/dropin/` (find the existing expiry test; extend) or new `tests/api/dropin/expire-payment-holds.test.ts`

**Interfaces:**
- Produces: `ExpireResult` gains `expiredPaymentHolds: number`.

- [ ] **Step 1:** In `expireOverduePromotions`, add a second UPDATE (same shape as lines 136-151) for payment holds:

```ts
const expiredHolds = await db
  .update(dropInBookings)
  .set({
    status: "cancelled",
    cancellationReason: "expired_payment_hold",
    cancelledAt: now,
    updatedAt: now,
  })
  .where(
    and(
      eq(dropInBookings.status, "pending_payment"),
      lte(dropInBookings.promotionExpiresAt, now),
    ),
  )
  .returning({ id: dropInBookings.id, sessionId: dropInBookings.sessionId });
```

Feed `expiredHolds` through the same `promoteNextWaitlister` loop (concatenate with `expiredRows` before the loop). Update the doc header (lines 1-17) to describe both flows.
- [ ] **Step 2:** API test: create a hold via walkin/start, force-expire it (direct db UPDATE of promotionExpiresAt to the past — follow the existing expiry test's approach), hit the cron route with CRON_SECRET, assert: status cancelled + reason `expired_payment_hold`; a seeded waitlisted row on the same session got promoted; the session's open capacity reflects the freed slot via `/api/admin/venue/today` or the event endpoint.
- [ ] **Step 3:** Run, commit.

---

### Task 4: Payment reminder

**Files:**
- Create: `src/lib/dropin/payment-reminder.ts`
- Modify: `src/lib/dropin/messages/dispatch.ts` (new `dispatchPaymentReminder(bookingId, selfServeUrl, expiresAt)` — mirror `dispatchWaitlistPromoted`'s channel logic: SMS if phone, else email)
- Modify: `src/pages/api/cron/expire-pending-claims.ts` (call reminder pass before expiry pass)
- Test: `tests/api/cron/` (mirror existing cron test auth pattern)

**Interfaces:**
- Produces: `sendDuePaymentReminders(now?: Date): Promise<{ reminded: number }>` — selects `pending_payment` rows with `reminderSentAt IS NULL AND promotionExpiresAt <= now + 30min AND promotionExpiresAt > now`, stamps `reminderSentAt` FIRST (single UPDATE … RETURNING claims the rows atomically against concurrent cron ticks), then dispatches per row via `awaitDispatch` (logged-not-thrown, same as promotion.ts:117-121).

- [ ] **Step 1:** Implement `sendDuePaymentReminders` with the stamp-then-send order (spec §5). The self-serve URL: re-derive from the booking's existing token if one is stored, else mint via the same helper walkin/start uses (read start.ts:210-250 for the token helper; reuse, don't duplicate).
- [ ] **Step 2:** Message copy (natural language, no ids): "Your spot for {session label} is held until {time in venue tz}. Complete payment to keep it: {link}".
- [ ] **Step 3:** Cron route calls reminders before expiry (so a row expiring within the same tick still got its stamp attempt — acceptable ordering per spec).
- [ ] **Step 4:** API test: hold with expiry 20min out → cron → `reminderSentAt` set, exactly once across two consecutive cron calls; hold 2h out → not reminded. Run, commit.

---

### Task 5: Command-center surface — status is the discriminator

**Files:**
- Modify: `src/pages/api/admin/check-in/event.ts`, `src/pages/api/admin/booking-search.ts` (include `pending_payment` in the status widening; `holdKind` field removed), `src/pages/api/admin/venue/cancel-hold.ts` (cancel `pending_payment` only; promotions keep the 409), `src/lib/admin/venue-day-data.ts` (count includes pending_payment)
- Modify: `src/components/admin/venue/command/ActivityDetailPanel.tsx`, `FindBookingPanel.tsx`, `PickupRollCall.tsx` (chip/action conditions on `status === "pending_payment"`; promotions keep passive "awaiting claim")
- Test: `tests/api/venue-hold-visibility.test.ts` (statuses updated — Task 2 started this; finish here)

**Interfaces:**
- Produces: row/result `status` union becomes `"confirmed" | "pending_payment" | "pending_claim"`; `holdKind` deleted everywhere (grep to zero).

- [ ] **Step 1:** Backend filters: `inArray(status, ["confirmed", "pending_payment", "pending_claim"])` where the roster/search shows holds; capacity counts include both pending kinds (they hold slots). cancel-hold: allow only `pending_payment`; keep 409s for promotions (message unchanged) and checked-in rows.
- [ ] **Step 2:** UI conditions: hold action cluster (Resend/Cancel) on `pending_payment`; "awaiting claim" passive chip on `pending_claim`; delete `holdKind` from types + payloads (grep `holdKind` to zero).
- [ ] **Step 3:** Run the hold-visibility + check-in + booking-search API tests and the venue-command-center e2e (`--workers=1`, port from Global Constraints). Commit.

---

### Task 6: Self-serve PayCard

**Files:**
- Modify: `src/pages/api/self-serve/[token]/index.ts` (context: `outstanding.payment`, `amountDueCents`, `locationSlug`)
- Create: `src/components/self-serve/PayCard.tsx`
- Modify: `src/components/self-serve/SelfServe.tsx` (render PayCard first when payment outstanding; completion gate; "Payment processing…" state)
- Test: `tests/api/self-serve/` (context fields), `tests/e2e/` (new spec or extend — Stripe test card, mirroring how kiosk payment is e2e-covered; if kiosk has no e2e, guard the spec on env like other payment tests — INVESTIGATE first and follow the house pattern)

**Interfaces:**
- Consumes: `/api/kiosk/[locationSlug]/walkin/payment` POST (read it first — payload shape, bookingId, returns clientSecret) and WalkInWizard.tsx's Elements setup (publishable key source, appearance).
- Produces: context gains `amountDueCents: number` and `locationSlug: string | null` when `outstanding.payment`; PayCard props `{ token, amountDueCents, locationSlug, bookingId, onPaid: () => void }`.

- [ ] **Step 1:** Token context: for `drop_in_booking` and `walkin_session` kinds resolve the booking; `outstanding.payment = booking.status === "pending_payment"`; include amount (walk-up rate precedence logic exists in event.ts:95 — reuse the same derivation) and the location slug via booking → session → venue → location.
- [ ] **Step 2:** PayCard: mirror WalkInWizard's PaymentElement mounting (same stripe-js imports, appearance, error states — use ErrorBanner/toast per house rules). On `paymentIntent.status === "succeeded"` client-side, call `onPaid` → SelfServe shows "Payment processing…" and polls the token context until `outstanding.payment` flips false (webhook is source of truth), then proceeds to the checked-in screen.
- [ ] **Step 3:** Completion gate in SelfServe: waiver && photo && !payment. PayCard renders ABOVE the others when outstanding.
- [ ] **Step 4:** API test for the context fields (pending_payment booking → payment outstanding + correct amount; confirmed booking → not outstanding). E2E per the investigated house pattern. Run, commit.

---

### Task 7: Copy restoration + resend = real pay link

**Files:**
- Modify: `src/components/admin/venue/command/WalkInFlow.tsx` (pay-link language restored; "held for 2 hours" TRUE now — say it again; method cards/subtitles/CTAs/success screens)
- Modify: `src/components/admin/venue/command/ActivityDetailPanel.tsx` (resend sends the self-serve link that now includes payment — label "Resend pay link"; keep SMS→email fallback from the cleanup batch)
- Test: `tests/e2e/venue-command-center.spec.ts` (string assertions), any spec asserting waiver-link copy

**Interfaces:**
- Consumes: everything above working end-to-end.

- [ ] **Step 1:** Grep the venue command components for "waiver link" copy introduced in #365 and restore pay-link language ONLY where the link now truly collects payment (the send targets the same self-serve token — verify the token kind sent by resend + WalkInFlow's post-create send-link call still points at the booking token that PayCard serves; if resend still mints a waiver-only token kind, fix the kind FIRST).
- [ ] **Step 2:** Update e2e string assertions (grep `/waiver link/i` in tests/e2e).
- [ ] **Step 3:** Run venue-command-center e2e serially; `npx tsc --noEmit`; commit.

---

### Task 8: Full verification + PR

- [ ] tsc; `./scripts/with-bws.sh npm run build`; full unit suite; branch-overlap API subsets (kiosk, check-in, dropin, self-serve, venue-hold-visibility, booking-search, cron); Playwright serial: venue-command-center, pickup-mode, check-in-flow, the new self-serve payment spec; live smoke: create hold → open link on "phone" (browser) → pay test card → roster flips to confirmed.
- [ ] Migration check: CI validates on ephemeral Postgres; confirm migration file committed and idempotent.
- [ ] PR: findings→task mapping, the enum-split rationale, backfill note (existing stranded holds enter the lifecycle at deploy; first sweep releases stale ones — strictly better than unpayable). Wait for CI green. Post-merge: monitor test-full; then close Tracker P1 with a comment linking the PR.
