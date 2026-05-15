# Field Rentals — Design Spec

**Date:** 2026-05-14
**Status:** Approved, ready for implementation planning
**Spec 1 of 2.** Spec 2 ("Venue Day & Check-In") depends on this and is brainstormed separately.

## Context

Aspire Sports needs customers to be able to rent a field/venue for a block of time and pay
online, and venue staff to be able to create rentals taken by phone or at the front desk.
This is the first of two specs. Spec 2 builds the venue-manager daily check-in screen and
customer self-check-in on top of the rental, drop-in, and game data; this spec deliberately
bakes in the data columns and query seams Spec 2 needs without building Spec 2's UI.

The existing **drop-in booking** feature (`src/lib/db/schema/drop-in.ts`, `src/pages/dropin/`,
`src/pages/api/dropin/`, `src/lib/stripe/`) is the template — same Stripe patterns, same
Connect-via-venue routing, same admin shape. Field rentals reuse those patterns rather than
inventing parallel ones.

## Goals

- Customers browse field availability for a venue/date and book + pay online.
- Admins create rentals taken by phone or walk-in (card-present, cash, or comp).
- A field cannot be double-booked (against other rentals or against scheduled games).
- The data model carries the waiver and check-in columns Spec 2 needs from day one.

## Non-goals

- The venue-manager check-in screen and customer self-check-in (Spec 2).
- Drop-in's own new waiver columns (Spec 2).
- Recurring rentals (a team renting every Tuesday).
- A `bookable_resources` table (a separate planned design); rentals key off
  `venues.fieldCount` + `fieldNumber`.
- Membership/allotment pricing for rentals (drop-in's tiered member pricing is not carried over).

## Approach

A single `field_rentals` table where one row is one booking is one occupied field-block.
Availability is computed on the fly (venue rental hours minus games minus existing rentals).
Conflict detection runs inside the booking transaction behind a Postgres advisory lock on
`(venueId, fieldNumber)`. A `pending_payment` status holds the field during Stripe checkout;
a scheduled function expires abandoned holds — a direct mirror of drop-in's existing
`pending_claim` + `expire-pending-claims` pattern.

Rejected alternatives:
- **Two tables (slots + bookings)** mirroring drop-in literally — rejected: rentals are not
  capacity-shaped, pre-creating every bookable hour is busywork, capacity is always 1.
- **Postgres `EXCLUDE` constraint** (`btree_gist` + `tstzrange`) for DB-level
  no-double-booking — deferred as a future hardening path: adds an extension dependency,
  still needs the app-level check for rental-vs-game, overkill for launch scale.

## Data model

### New table: `field_rentals`

One row = one booking = one occupied field-block.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organizationId` | uuid FK → organizations | |
| `venueId` | uuid FK → venues | |
| `fieldNumber` | integer | conflict-detection key; 1..`venues.fieldCount` |
| `startsAt` | timestamptz | |
| `endsAt` | timestamptz | |
| `status` | enum `field_rental_status` | `pending_payment` \| `confirmed` \| `cancelled` \| `completed` \| `no_show` |
| `source` | enum `field_rental_source` | `online_booking` \| `admin_created` |
| `renterUserId` | uuid FK → users, nullable | null for phone/walk-in renters without an account |
| `renterName` | text | always populated (denormalized for Spec 2's day view — no user join needed) |
| `renterEmail` | text, nullable | |
| `renterPhone` | text, nullable | |
| `partySize` | integer | informational |
| `purpose` | text, nullable | e.g. "birthday party", "team practice" |
| `notes` | text, nullable | admin notes |
| `paymentMethod` | enum `field_rental_payment_method` | `card_online` \| `card_present` \| `cash` \| `comp` |
| `amountDueCents` | integer | resolved price |
| `amountPaidCents` | integer, default 0 | |
| `paymentStatus` | enum `field_rental_payment_status` | `unpaid` \| `paid` \| `refunded` |
| `stripePaymentIntentId` | text, nullable | PI or checkout session id |
| `stripeRefundId` | text, nullable | |
| `paymentExpiresAt` | timestamptz, nullable | hold TTL for `pending_payment` rows |
| `waiverSigned` | boolean, default false | Spec 2 seam; online rentals populate it |
| `waiverSignedAt` | timestamptz, nullable | Spec 2 seam |
| `waiverSignedBy` | text, nullable | Spec 2 seam; typed signer name |
| `checkedInAt` | timestamptz, nullable | Spec 2 seam; unused until Spec 2 |
| `checkedInByUserId` | uuid FK → users, nullable | Spec 2 seam |
| `createdByUserId` | uuid FK → users, nullable | |
| `cancelledAt` | timestamptz, nullable | |
| `cancellationReason` | enum `field_rental_cancellation_reason` | `user_request` \| `admin_override` \| `venue_unavailable` |
| `createdAt` | timestamptz, default now | |
| `updatedAt` | timestamptz, default now | |

Indexes: `(venueId, startsAt)`, `(organizationId, startsAt)`, `(renterUserId, startsAt)`,
partial `(venueId, fieldNumber, startsAt)` where `status in ('pending_payment','confirmed')`.

### New table: `field_rental_rate_card`

One row per organization (unique on `organizationId`), mirrors `dropInRateCard`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organizationId` | uuid FK, unique | |
| `defaultHourlyRateCents` | integer | org default hourly rate |
| `cancelWindowHours` | integer, default 24 | refund-eligible window before `startsAt` |
| `bookingIncrementMinutes` | integer, default 60 | booking granularity |
| `minDurationMinutes` | integer, default 60 | |
| `maxDurationMinutes` | integer, default 240 | |
| `updatedAt` | timestamptz | |
| `updatedByUserId` | uuid FK, nullable | |

### `venues` table — 4 new columns

| Column | Type | Notes |
|---|---|---|
| `rentalEnabled` | boolean, default false | is this venue rentable at all |
| `rentalHourlyRateCents` | integer, nullable | per-venue override; null falls back to rate-card default (mirrors drop-in's session-override-wins pattern) |
| `rentalOpenMinute` | integer, nullable | rental window open, minutes from midnight (org tz); null = no restriction |
| `rentalCloseMinute` | integer, nullable | rental window close, minutes from midnight |

### Migration

One `npm run db:generate` migration adding the two tables, the four `venues` columns, and
five new enums (`field_rental_status`, `field_rental_source`, `field_rental_payment_method`,
`field_rental_payment_status`, `field_rental_cancellation_reason`). Additive and
forward-compatible per repo convention. Commit the generated SQL.

## Availability + conflict detection

`getVenueRentalAvailability(venueId, date)` — for each field `1..venues.fieldCount`, returns
the free blocks: the venue's rental hours (`rentalOpenMinute`..`rentalCloseMinute`) minus:
- scheduled / in-progress **games** on that `(venueId, fieldNumber)` (game end =
  `scheduledAt + durationMinutes`);
- **confirmed** and **non-expired `pending_payment`** rentals on that field.

Drop-in sessions are **excluded from the v1 conflict net** — they carry no field number
(`dropInSessions.bookableResourceId` is an unshipped TODO). Documented limitation; Spec 2's
unified day view surfaces rentals, games, and drop-in together so a human catches the rare
overlap.

`assertNoRentalConflict({ venueId, fieldNumber, startsAt, endsAt, excludeRentalId? })` runs
inside the booking transaction behind `pg_advisory_xact_lock(hash(venueId, fieldNumber))`,
which serializes concurrent booking attempts for the same field and covers both
rental-vs-rental and rental-vs-game. It also validates the requested block against the venue
open-hours window and the rate card's min/max duration.

## Customer booking flow + payment

Pages mirror `/dropin`: `/rentals` (pick venue + date → a field × time availability grid
from `getVenueRentalAvailability`) plus a booking panel.

1. Customer picks field + start + duration; UI shows price = hours × resolved hourly rate
   (`venues.rentalHourlyRateCents` ?? `field_rental_rate_card.defaultHourlyRateCents`).
2. Customer fills renter detail (prefilled if logged in), `partySize`, `purpose`, and
   **signs the liability waiver** (typed name + accept checkbox) — so online rentals always
   arrive waiver-signed.
3. `POST /api/rentals/bookings` — server takes the advisory lock, re-checks
   conflict / open-hours / duration, resolves price, then:
   - **Inserts a `pending_payment` row immediately**, setting `paymentExpiresAt = now + 30min`.
     This holds the field during checkout — rentals are exclusive, unlike capacity-based
     drop-in, so the slot must be reserved before the customer leaves for Stripe.
   - Creates a Stripe **Checkout Session**, Connect-aware: if `venue.partnerStripeAccountId`
     is set, adds `payment_intent_data.transfer_data.destination` +
     `application_fee_amount` (= `amountDueCents * venue.partnerApplicationFeePct / 100`),
     exactly as `src/pages/api/dropin/bookings/index.ts` does. Metadata
     `{ type: "field_rental", rentalId }`.
   - Returns `{ paymentRequired: true, checkoutUrl }`. A `comp` / $0 path skips Stripe and
     inserts a `confirmed` row directly.
4. `checkout.session.completed` webhook → new `handleFieldRentalCheckoutComplete()` (in
   `src/lib/stripe/`) flips the `pending_payment` row to `confirmed` and sets
   `amountPaidCents`, `stripePaymentIntentId`, `paymentStatus: paid`. Idempotent via the
   existing `stripe_events` ledger plus a per-handler check. Fires-and-forgets a booking
   confirmation email/SMS.
5. New scheduled function `expire-pending-rentals` releases holds whose `paymentExpiresAt`
   has passed (sets `status: cancelled`, `cancellationReason: user_request`) — a direct
   mirror of the existing `expire-pending-claims` job.

Success / cancel return to `/rentals?booking=success|cancelled` and the booking shows in
`/dashboard/bookings`.

## Admin-created (phone / walk-in) flow

`/admin/rentals/new` panel: pick venue / field / time, enter renter name / phone / email,
`partySize`, `purpose`. Payment method:
- `card_present` → PaymentIntent via Stripe Terminal (mirror
  `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts`), Connect-aware; inserts a
  `pending_payment` row, the `payment_intent.succeeded` webhook confirms it.
- `cash` / `comp` → inserts a `confirmed` row immediately (`paymentStatus: paid` for cash,
  a `comp` method for comp).
- `card_online` → confirmed row plus an emailed payment link (optional; may defer).

Waiver: the admin may mark it signed (paper on file) or leave it unsigned — Spec 2's venue
check-in screen captures it at the door.

## Admin management

Mirror the drop-in admin surface:
- `/admin/rentals` — list / filter by venue, date range, status.
- `/admin/rentals/[id]` — detail; cancel; refund.
- `/admin/rentals/rate-card` — edit `field_rental_rate_card` (reuse the `RateCardEditor`
  pattern from `src/components/admin/dropin/RateCardEditor.tsx`).
- The venue edit page gains the four rental fields.

Cancel-with-refund issues a Stripe refund using the existing refund helper and
idempotency-key convention, then sets `status: cancelled`, `paymentStatus: refunded`.

## APIs

Customer:
- `GET /api/rentals/availability?venueId=&date=` — computed availability grid.
- `POST /api/rentals/bookings` — create a booking (auth required).
- `GET /api/rentals/bookings` — the caller's own rentals (dashboard).

Admin (all gated by `requireAdminAccess` + `requireOrganizationContext` +
`requireSameOrgVenue`):
- `GET /api/admin/rentals`, `POST /api/admin/rentals`
- `GET /api/admin/rentals/[id]`, `PATCH /api/admin/rentals/[id]`
- `POST /api/admin/rentals/[id]/refund`
- `GET /api/admin/rentals/rate-card`, `PUT /api/admin/rentals/rate-card`

Webhook: extend `src/pages/api/webhooks/stripe.ts` to handle `type: "field_rental"` on both
`checkout.session.completed` and `payment_intent.succeeded` (card-present).

## Customer dashboard

Extend `/dashboard/bookings` to list rentals alongside drop-in bookings — a sibling component
to `MyDropInBookings`, fed by `GET /api/rentals/bookings`. The cancel button respects
`cancelWindowHours`. (Spec 2 later adds a self-check-in button here.)

## Spec 2 seams — baked in now, not built now

- `waiverSigned` / `waiverSignedAt` / `waiverSignedBy` columns exist on `field_rentals` from
  day one — online rentals populate them; admin phone bookings leave them for the door.
- `checkedInAt` / `checkedInByUserId` columns and the `no_show` status value ship now,
  unused until Spec 2.
- `renterName` is denormalized and `(venueId, startsAt)` is indexed → Spec 2's venue day
  query stays a cheap single-table read.
- `getVenueRentalAvailability` and the `field_rentals` day rows are the exact data Spec 2's
  check-in screen consumes.
- Drop-in's *own* new waiver columns are **not** pulled forward — they stay in Spec 2.

## Error handling

- Booking conflict (lost the race, or a game/rental overlaps): `POST /api/rentals/bookings`
  returns a 409 with a clear message; the UI refreshes the availability grid.
- Outside open-hours or violating min/max duration: 422 with the specific reason.
- Stripe checkout creation failure: the `pending_payment` row is rolled back in the same
  transaction so the hold is not orphaned.
- Webhook idempotency: the `stripe_events` ledger plus a per-handler check on
  `stripePaymentIntentId` prevent double-confirmation.
- Refund failure: surfaced to the admin; the rental is not marked `cancelled` until the
  refund succeeds.

## Testing

- **API integration tests** (`tests/api/`): availability computation; conflict rejection
  (rental-vs-rental and rental-vs-game); the `pending_payment` → `confirmed` webhook path;
  refund.
- **Unit tests** (`tests/unit/`): the availability/overlap math and price resolution (pure
  functions).
- **E2E** (`tests/e2e/`): a customer books a field end to end through Stripe test mode.
- Pre-push checklist: generated migration committed, `npm run db:seed:e2e`,
  `npx tsc --noEmit` clean, `npm run build` clean.

## Rollout

Additive migration, forward-compatible — ships on merge to `main` via the standard release
process. `field_rental_rate_card` needs one row seeded per org (or lazily created on first
rate-card edit). Venues default to `rentalEnabled: false`, so the feature is dark until an
admin enables a venue and sets its rate.
