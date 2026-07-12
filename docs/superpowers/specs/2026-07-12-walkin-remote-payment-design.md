# Walk-in Remote Payment + Hold Lifecycle — Design Spec

- **Date:** 2026-07-12
- **Status:** Approved design (validated in conversation); ready for implementation planning
- **Closes:** Tracker P1 "Self-serve walk-in pay link has no payment step — remote payment never completes" (page 39a40b5d-af23-81c5-859f-d15c578ace97)
- **Context:** follow-on to the command-center polish (PRs #365/#366), which re-scoped all walk-in copy to "waiver link" because the sent link could not collect payment.

## Problem

The command-center walk-in flow creates a `pending_claim` hold and texts/emails a self-serve link — but `SelfServe.tsx` renders only Waiver and Photo cards; `outstanding.payment` is ignored. Customers sign, see "You're checked in!", never pay, and the hold sits forever (no expiry has ever been enforced). Payment currently works only via the kiosk hand-off. Walk-in revenue leaks and slots rot.

## Decisions (owner-confirmed 2026-07-12)

1. **Hold TTL: 2 hours**, enforced. Expiry auto-releases the slot and promotes the next waitlister if one exists.
2. **One payment reminder** ~30 minutes before expiry ("complete payment to keep your spot"), sent via the channel that worked at creation (SMS first, email fallback). Never more than one.
3. (Technical, forced by #1) **`pending_payment` enum value now**: the polish shipped `promotionExpiresAt`-null as the walk-in/promotion discriminator; stamping a TTL on walk-in holds would break it. Walk-in holds get their own status; status becomes the discriminator; both flows can then safely share `promotionExpiresAt` as their expiry column; the `holdKind` shim retires.

## Goals

- The texted/emailed link **collects payment** on the customer's phone (Stripe PaymentElement) and completes the booking exactly like the kiosk path (confirmed + paid via the existing webhook).
- Holds have an honest, enforced lifecycle: created → reminded → paid OR expired (slot freed, waitlist promoted, reason recorded).
- Walk-in flow copy returns to "pay link" language — true again once this ships.
- "Resend" on a held roster row re-sends the real pay link (both channels attemptable), not just the waiver token.

## Non-goals

- Stripe Terminal / card-present hardware (still deferred).
- Changing the kiosk flow (it keeps working as-is; the webhook confirm path is shared).
- Refunds/disputes on walk-ins (existing flows cover).
- Expiry-notice message after the slot is released (owner chose single reminder only).

## Design

### 1. Schema (additive migration, idempotent per repo convention)

- `drop_in_booking_status` enum gains `pending_payment` (`DO $$ … duplicate_object …` pattern).
- `drop_in_bookings` gains `reminderSentAt timestamptz NULL` (`ADD COLUMN IF NOT EXISTS`).
- The cancellation-reason enum gains `expired_payment_hold` (same idempotent pattern).
- No backfill needed: existing `pending_claim` rows that are walk-in holds (promotionExpiresAt IS NULL) are handled by a one-time idempotent UPDATE in the same migration — they become `pending_payment` with `promotionExpiresAt = created_at + interval '2 hours'` (already-expired ones will be swept on the first cron pass after deploy).

### 2. Hold creation (`/api/kiosk/[locationSlug]/walkin/start`)

Inserts `status: "pending_payment"` with `promotionExpiresAt = now() + 2h`. Module comment corrected (the cleanup batch already fixes the stale claim; this change makes the 2h real).

### 3. Self-serve payment (`PayCard`)

- Token context (`/api/self-serve/[token]/index.ts`): for booking-bearing kinds, sets `outstanding.payment = booking.status === "pending_payment"`, and adds `amountDueCents` + `locationSlug` to the context payload (slug resolved via booking → session → venue → location).
- New `src/components/self-serve/PayCard.tsx`: renders amount due; on expand, POSTs the existing `/api/kiosk/[locationSlug]/walkin/payment` (public-by-slug, rate-limited; validates the booking belongs to that location) to create the PaymentIntent and mounts Stripe PaymentElement (same publishable-key wiring as the kiosk wizard). On payment success the existing webhook (`handle-dropin-walkin-payment.ts`) flips the row to `confirmed` + paid — no new confirm path.
- `SelfServe.tsx`: completion condition becomes waiver && photo && !outstanding.payment (payment card marks done on intent success client-side, with the webhook as source of truth; a paid-but-webhook-lagging state shows "Payment processing…" rather than "checked in").
- Ordering: PayCard renders ABOVE waiver/photo when payment is outstanding (money first — it's the step that holds the slot).

### 4. Expiry sweep

`expireOverduePromotions` itself (not a sibling) gains a `pending_payment` branch: rows with `promotionExpiresAt <= now()` → `status: "cancelled"`, `cancellationReason: "expired_payment_hold"` (new reason enum value, added in the same additive migration as §1), then `promoteNextWaitlister(sessionId)`. Idempotent, batch-safe.

### 5. Reminder cron

Same cron cadence: rows where `status = "pending_payment"`, `reminderSentAt IS NULL`, `promotionExpiresAt - now() <= 30 minutes` (and > 0) → send one message via existing SMS/email infra (SMS if phone on file, else email) with the self-serve link and the expiry time; stamp `reminderSentAt` in the same transaction as the send decision (stamp-then-send, so a crashed send can't double-fire; a stamped-but-unsent edge is acceptable).

### 6. Command-center surface updates

- `event.ts` / `booking-search.ts` / `cancel-hold.ts` / roster UI: `pending_payment` replaces the `holdKind === "walk_up"` checks (status IS the discriminator now); `pending_claim` rows (waitlist promotions) keep the passive "awaiting claim" treatment. `holdKind` field removed from payloads and types.
- Roster held-row actions: "Resend pay link" (re-mints/re-sends the self-serve link — SMS then email fallback, matching the cleanup batch's resend pattern) + existing "Cancel hold".
- WalkInFlow copy: pay-link language restored ("Email/Text a pay link", "held for 2 hours" — true now), success screens updated accordingly.

### 7. Testing

- **Unit:** expiry-branch selection logic; reminder eligibility window (pure functions where extractable).
- **API:** token context exposes payment outstanding + amount for pending_payment rows; payment-intent creation from a self-serve context (mock/R2-style guards as the kiosk tests do); sweep expires an overdue hold, frees capacity, promotes a seeded waitlister, stamps reason; reminder sends once and never twice; cancel-hold still 409s promotions and checked-in rows; tenant scoping on any new/changed admin read.
- **E2E (Playwright):** self-serve link → PayCard → Stripe test card `4242…` → booking confirmed on the roster (poll) — guarded/skipped when Stripe keys are absent, following existing payment e2e conventions (check how kiosk payment is e2e-tested and mirror it).
- **Migration:** runs green on CI's ephemeral Postgres; drifted-DB idempotency per 0023/0024 pattern.

### 8. Rollout

Additive migration ships first in the same PR (repo auto-migrates on merge). The status backfill converts live holds to the new lifecycle at deploy; the first sweep pass releases any stale ones (they've been unpayable anyway — releasing is strictly better). Copy changes ride the same PR. Tracker P1 closed on merge; the "pay link" language must NOT merge without the PayCard (single PR enforces this).

## Risks / notes

- The payment endpoint is authorized by location slug + rate limit (kiosk model). It already validates booking↔location; the PayCard adds no new auth surface, but the API test must prove a cross-location booking id is rejected.
- Webhook lag: the client shows "Payment processing…" until the poll reflects `confirmed`; no client-side status writes.
- Message sends cost money; the reminder is bounded to one per booking by `reminderSentAt`.

> **Amendment note (2026-07-12):** the backfill described below was superseded — no SQL backfill ships (enum-use-in-migration breaks from-empty CI runs); the expiry sweep handles legacy rows in code. See the plan amendment.
