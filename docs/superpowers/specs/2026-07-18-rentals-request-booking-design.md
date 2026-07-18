# Request-based field rentals — design

**Date:** 2026-07-18
**Branch:** `feat/rentals-request-booking` (worktree off `main`)
**Scope:** Both brands (SoccerOne `/soccerone/rent` and Aspire `/rentals`)

## Problem

Online field-rental booking is instant self-service today: a signed-in visitor
picks a slot on the calendar, accepts the waiver, and is sent straight to Stripe
Checkout. The webhook confirms the row. The owner wants a **request** step in
between — the venue should review and approve each booking before payment is
collected.

## Goal

Replace instant online booking with: **request → admin approves → pay-link →
Stripe → confirmed**. A pending request holds the slot so two people can't
request the same time. Applies to both brands (one shared booking API).

## Non-goals

- No change to the admin-created rental path (`source: admin_created`), which is
  already a direct create.
- No change to Stripe Connect / payout mechanics — approval reuses the existing
  Checkout + webhook confirmation path.
- No anonymous/token-based payment — booking already requires sign-in, so the
  renter is always a known user and pays from their dashboard.
- Conversational SMS / two-way notifications are out of scope; notifications are
  one-way email (respecting `MESSAGING_LIVE`).

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Request model | Request → admin approves → pay-link (payment still online, gated by approval) |
| Scope | Both brands |
| Does a pending request block the slot? | Yes |
| Minimum lead time to request a slot | **48 hours** (hard guard; email venue for sooner) |
| Un-approved request auto-release | After `requestHoldHours` (rate-card, default **24h**), or slot start, whichever first |
| Pay window after approval | **24 hours** |
| Admin notification of new request | Dashboard **and** email, both in this change |

Timeline sanity check for a slot exactly 48h out: request now → admin has up to
24h to approve → renter has up to 24h to pay → payment lands by slot start.

## Architecture

### 1. Schema + migration (`src/lib/db/schema/field-rentals.ts`)

- Add `requested` to `field_rental_status` enum. New lifecycle:
  `requested → pending_payment → confirmed` (paid path), or
  `requested → confirmed` ($0/comp path), or
  `requested → cancelled` (declined / expired).
- Add `requestExpiresAt timestamptz` (nullable) — distinct from
  `paymentExpiresAt` so the request-hold sweep and the payment-hold sweep never
  key off the same column.
- Add `requestHoldHours integer NOT NULL DEFAULT 24` and
  `minLeadTimeHours integer NOT NULL DEFAULT 48` to `field_rental_rate_card`
  (policy lives with the other rate-card knobs the admin already controls).
- Reuse the existing `venue_unavailable` value in
  `field_rental_cancellation_reason` for declines.
- Migration generated via `npm run db:generate`; enum add written idempotently
  (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`) per the 0023/0024 pattern.

### 2. Slot blocking (`src/lib/rentals/conflicts.ts`, index, ledger)

- `assertNoRentalConflict` blocks on non-expired `requested` rows in addition to
  `confirmed` / non-expired `pending_payment` (mirror the `paymentExpiresAt`
  freshness check using `requestExpiresAt`).
- Extend the `field_rentals_active_field_idx` partial-index WHERE to include
  `requested`.
- The scheduling ledger source-block is created for `requested` rows too (so the
  public calendar renders the slot unavailable) and removed on decline/expiry.

### 3. Public booking API (`POST /api/rentals/bookings`)

- New `createRentalRequest` in `src/lib/rentals/booking.ts`: conflict-checked
  insert of a `requested` row inside a transaction (same advisory-lock pattern
  as `createRentalHold`). No Stripe call. Stores the computed `amountDueCents`
  (brand-aware pricing, member discount) + waiver + `requestExpiresAt = now +
  requestHoldHours`. Creates the ledger block.
- Endpoint changes:
  - Keep validation, brand-aware pricing, member discount, and the far-end
    booking-window check.
  - Add near-end **min-lead-time guard**: reject if `startsAt < now +
    minLeadTimeHours` with a message pointing them to email the venue. (Skipped
    under `E2E_TEST_ENDPOINTS=yes`, same as the existing window check.)
  - On success return `{ requested: true, rentalId }` — no `checkoutUrl`.
  - `$0`/comp: still creates a `requested` row (venue vets even free use); the
    approval step confirms it directly.
- Fire the admin-notification email (see §7) after the request commits.

### 4. Front-end (`src/components/soccerone/FieldCalendar.tsx`, `src/components/rentals/RentalBooking.tsx`)

- CTA "Book this slot" → "Request this slot".
- `handleBook` → `handleRequest`: on `{ requested: true }`, show a success state
  ("Request submitted — the venue will review and email you a link to pay") in
  place of the Stripe redirect. No `window.location = checkoutUrl`.
- Slots < 48h out render disabled with a "requests must be 48h ahead — call the
  venue for sooner" affordance (client-side mirror of the server guard).
- Page copy on `/soccerone/rent.astro` and the Aspire `/rentals` page updated
  from "Book a field" framing to "Request a field" where it implies instant
  booking (rates table + availability calendar stay).

### 5. Admin approval (`src/components/admin/rentals/RentalsList.tsx`, `RentalDetail.tsx`, `PATCH /api/admin/rentals/[id].ts`)

- `RentalsList`: `requested` badge + status filter + a pending-requests count so
  new requests are visible at a glance.
- `RentalDetail`: **Approve** and **Decline** actions shown only for `requested`
  rows.
- `PATCH /api/admin/rentals/[id]` gains `approve: true` and `decline: true`
  actions (tenant-ownership checked as today):
  - **Approve**, amount > 0: transition to `pending_payment`,
    `paymentExpiresAt = now + 24h`, clear `requestExpiresAt`; send the
    approval/pay-link email (§9).
  - **Approve**, amount == 0: transition to `confirmed`; send confirmation email.
  - **Decline**: `cancelled`, `cancellationReason = venue_unavailable`, remove
    ledger block, send decline email.
  - Status guard: approve/decline valid only from `requested`.

### 6. Payment after approval (`/dashboard/bookings`, new mint-checkout endpoint)

- The approved rental appears in `/dashboard/bookings` (via `MyBookings` /
  `MyFieldRentals`) with a **"Pay now"** button and the 24h countdown (reuses
  `HoldCountdown` against `paymentExpiresAt`).
- New `POST /api/rentals/bookings/[id]/pay` (renter-owned, `pending_payment`
  only): mints a **fresh** Stripe Checkout Session on demand (avoids
  session-expiry) with the same metadata shape the current flow uses; returns
  `checkoutUrl`. The existing webhook flips the row to `confirmed` — unchanged.
- Approval email links to `/dashboard/bookings`.

### 7. Admin notification email (new request)

- On request creation, email the org/venue (respects `MESSAGING_LIVE`,
  `MESSAGING_MOCK`) with slot, renter, and a deep link to the admin rental
  detail. New template alongside the existing rental messages.

### 8. Expiry cron (`src/lib/rentals/expire.ts`, `/api/cron/expire-pending-rentals`)

- Extend the sweep (or add `expireStaleRentalRequests`) to cancel `requested`
  rows past `requestExpiresAt`, free the ledger block, and — optionally — email
  the renter that the request lapsed. Same 5-minute cron; no new schedule.

### 9. Messaging templates (`src/lib/rentals/messages/`)

- `request-received` (renter): "we got your request, pending review."
- `request-approved` (renter): approval + pay-link + 24h deadline.
- `request-declined` (renter): declined, with a nudge to pick another slot.
- `new-request-admin` (venue): §7.
- Follow the existing `rental-confirmation.ts` / `dispatch.ts` structure.

### 10. Tests

- **API** (`tests/api/`): update existing rental-booking tests — POST now returns
  `{ requested: true }`, not `checkoutUrl`. Add: min-lead-time rejection;
  request holds slot (second request to same slot → 409); approve → 
  `pending_payment` + 24h `paymentExpiresAt`; approve $0 → `confirmed`; decline →
  `cancelled` + slot freed; `pay` endpoint mints checkout only from
  `pending_payment`.
- **Unit** (`tests/unit/`): lead-time + request-expiry math.
- **E2E** (`tests/e2e/`): update the FieldCalendar spec to the request flow (runs
  post-merge via `test-full` — update it in this change so the post-merge run
  stays green).

## Rollout / risks

- **Shared API, both brands** — this changes Aspire `/rentals` behavior too, by
  design. Grep both storefronts' copy for "book now" language.
- **Migration** — schema touch → `db:generate`, commit the migration, idempotent
  enum add. Pre-push checklist (API tests + build + `tsc`) applies.
- **E2E post-merge gap** — the FieldCalendar/rentals E2E only runs in
  `test-full`; update it here so it doesn't silently break after merge.
- **Existing pending holds** — pre-existing `pending_payment` rows are unaffected
  (new statuses/columns are additive; `requestExpiresAt` is null on them).

## Open follow-ups (not in this change)

- SMS notification of approval (email only for now).
- Admin bulk approve/decline.
- Configurable per-venue (vs per-org) request policy.
