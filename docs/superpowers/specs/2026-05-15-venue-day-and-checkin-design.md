# Venue Day & Check-In — Design Spec

**Date:** 2026-05-15
**Status:** Approved, ready for implementation planning
**Spec 2 of 2.** Spec 1 (Field Rentals) shipped in PR #46; the rental columns
(`waiverSigned`, `checkedInAt`, `no_show`, denormalized `renterName`,
`(venueId, startsAt)` index) and the drop-in `checkedInAt` column already in
place are the data seams this spec consumes.

## Context

The venue manager at a venue's front-desk computer needs to see, for every
event happening today, who booked, who signed their waiver, who's checked
in. They need to be able to drive missing-step completion without typing
the player's name into a waiver on the staff machine (legally weak and
slow). A late walk-in must be fully self-servable on a venue tablet,
including paying.

Three surfaces solve this:
1. **Manager dashboard** at `/admin/check-in` — status + triggers, no
   player-signed data ever collected on the staff computer.
2. **Player self-service** at `/self-serve/[token]` — opened from an
   email/SMS link or a QR code on the manager's screen. The player
   completes the missing steps on their own phone.
3. **Venue kiosk** at `/kiosk/[venueSlug]` — same self-service flow,
   pinned to a venue tablet. Supports find-my-booking search AND
   walk-in registration with payment via embedded Stripe PaymentElement.

The existing drop-in admin attendance panel (`AttendancePanel.tsx`) is
per-session and feature-rich; the venue manager screen is intentionally a
different, JTBD-focused surface that links to the same underlying data.

## Goals

- One glance, time-ordered, "what's on tap at this venue today."
- Drill into any event to see every expected person with photo, waiver
  status, check-in status, phone in consistent `(NNN) NNN-NNNN` format.
- Manager never types a player's name into a waiver field. Manager triggers
  link delivery; the player or parent signs on their own device.
- A walk-in player with no prior booking can complete the full flow
  (pick session → contact info → waiver → photo → pay) on a kiosk in
  under two minutes.
- Customer self-check-in available on `/dashboard/bookings` for drop-in
  and rentals within a sensible window around the event start.

## Non-goals

- Replacing the existing drop-in per-session admin attendance panel.
  The manager dashboard is an additional, glanceable surface; the
  per-session panel stays for power use.
- Game-by-game roster check-in for league play. Spec 2 supports it
  (rosters appear on game cards) but does not change how coaches mark
  practice/game attendance via `/coach/attendance/`.
- Capture of liability waivers as image/PDF uploads. Waiver capture is
  text + acknowledgment + typed signer name (matches the registration
  flow's existing pattern).
- Recurring or scheduled link-resend (e.g. "remind everyone 24h before").
  Out of scope; can ride a later notification spec.

## Approach

**Architecture:**
- Manager dashboard polls a single day-view endpoint every ~5s to reflect
  player-side completions in near-real-time.
- Player-side surfaces (phone + kiosk) are token-authenticated, no login.
  Tokens are single-use, short-lived, scoped to one target row.
- Walk-in registration on the kiosk uses an embedded `<PaymentElement />`
  (not a Stripe Checkout redirect) so the card stays on the kiosk page.
  Connect-aware via `venue.partnerStripeAccountId`, mirroring drop-in and
  rental flows.
- Phone numbers normalized on write to 10 digits, formatted on display.

**Rejected alternatives** (already worked through in the brainstorm):
- All-on-the-staff-computer waiver capture — legally weak, UX bottleneck.
- Kiosk-only (no SMS/email link) — leaves players queueing at the tablet.
- SMS-only — costs per send and not noticeably faster than email when the
  player is expecting the message.

## Data model

### New columns on `drop_in_bookings`

| Column | Type | Notes |
|---|---|---|
| `waiverSigned` | boolean notNull default false | mirrors registration / field_rentals |
| `waiverSignedAt` | timestamptz nullable | |
| `waiverSignedBy` | text nullable | parent name for minors |

### New column on `drop_in_rate_card` and `field_rental_rate_card`

| Column | Type | Notes |
|---|---|---|
| `checkInWindowMinutes` | integer notNull default 60 | bounds the period around `startsAt` when the customer self-check-in button is visible on `/dashboard/bookings` |

### New table: `self_service_tokens`

Single-use tokens that authenticate the player or parent on the public
self-service surface.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `token` | text unique notNull | base64url, 32 bytes |
| `kind` | enum `self_service_token_kind` | `drop_in_booking` \| `field_rental` \| `roster_entry` \| `walkin_session` |
| `targetId` | uuid notNull | the row this token authorizes (booking id / rental id / roster id / session id for walk-in) |
| `organizationId` | uuid FK → organizations | |
| `venueId` | uuid FK → venues, nullable | known for drop-in/rental/roster; for walk-in start, set after they pick |
| `sentVia` | enum `self_service_send_channel` | `email` \| `sms` \| `qr` \| `kiosk_search` \| `customer_dashboard` |
| `recipientUserId` | uuid FK → users, nullable | parent or self |
| `recipientEmail` | text nullable | mirror of the email this was sent to |
| `recipientPhone` | text nullable | mirror of the phone this was sent to |
| `expiresAt` | timestamptz notNull | default now + 6h |
| `consumedAt` | timestamptz nullable | first time the token was used to write |
| `consumedByIp` | text nullable | best-effort audit |
| `createdAt` | timestamptz notNull defaultNow | |
| `createdByUserId` | uuid FK → users, nullable | manager who triggered (null for kiosk-search and customer-dashboard) |

Indexes:
- unique `(token)`
- `(targetId, kind)` (most-recent token per target)
- partial `(expiresAt)` where `consumedAt IS NULL` (cleanup sweep)

Two new enums: `self_service_token_kind`, `self_service_send_channel`.

### Phone normalization

A pure helper module `src/lib/phone.ts`:
- `normalizePhone(raw): string` — strips all non-digits, returns the
  last 10 (drops a leading "1" country code). Empty/null → empty string.
- `formatPhone(raw): string` — normalize first, then format as
  `(NNN) NNN-NNNN`. Falls back to the original string if the normalized
  form isn't 10 digits.
- Used at every write site that accepts a phone (rental admin form,
  walk-in registration, contact-info update) and at every display site
  (drawer rows, dashboard bookings, admin lists).

### Phone normalization migration

A small backfill commit normalizes existing values in:
- `field_rentals.renterPhone`
- `users.phone`
- `family_members.emergencyContactPhone`

Idempotent (re-running the migration on a normalized row is a no-op). The
migration only normalizes; it does not validate. Rows with un-normalizable
phones (international, garbage) are left as-is.

## Manager dashboard at `/admin/check-in`

SSR Astro page; admin-gated by existing middleware. Renders a
`client:load` React island.

**Header:**
- Venue `<select>` — populated from `Astro.locals.organization`'s
  `venues` where `active = true`. Default: the venue with the most
  events today, or the only one.
- Date `<input type="date">`, default today.
- Summary line: `"3 games · 2 pickup · 1 rental · 48 expected · 5 waivers outstanding"`.

**Body:**
- Time-ordered event cards. Each card normalizes the underlying row into
  a shared shape `{ kind, id, startsAt, endsAt, title, fieldNumber,
  counts: {expected, waiversOutstanding, checkedIn} }`. The kinds:
  - `drop_in_session` — title = `sportOrClassLabel`.
  - `game` — title = `"<HomeTeam> vs <AwayTeam>"`.
  - `field_rental` — title = `"<renterName>"` + purpose if set.
- Empty state: "Nothing scheduled at this venue today."

**Drill-in drawer:**
- Slides in from the right (mobile: full screen). Header shows event
  title + time + counts + close button.
- Per-row layout, top-to-bottom:
  - 36px circular photo or initials avatar. If no photo, render a `＋`
    badge over the avatar; tapping opens a file picker / camera input;
    on upload, writes to `users.avatarUrl` (adult drop-in/rental) or
    `family_members.photoUrl` (youth, roster, parent-booked).
  - Name (bold) + sub-line: age class / parent name (for minors) /
    phone in `(NNN) NNN-NNNN` format.
  - Waiver badge: `✓ waiver` (green) or `⚠ no waiver` (red). Tapping
    the red badge opens the manager's send-link panel.
  - Send-link compact row (when waiver or photo is outstanding):
    `[ Email ]  [ SMS ]  [ Show QR ]`. Email is the primary (filled);
    SMS and QR are secondary (outlined).
  - Check-in button: `[ Check in ]` (when not checked in) or
    `[ Here ✓ ]` (green pill when already checked in). Idempotent.

**Polling:** while the drawer is open, the island polls
`GET /api/admin/check-in/day?venueId=&date=` every 5s. The endpoint
returns the same shape, so the drawer can reconcile state without a
page reload. When a player finishes the waiver on their phone, the row
flips to ✓ within 5s.

**Routing note:** `/admin/game-day/today` is already the
activity-tracking dashboard. `/admin/check-in` is a new sibling route
distinct from that.

## Send-link mechanism

When the manager clicks **Email** / **SMS** / **Show QR** on a drawer
row:

1. `POST /api/admin/check-in/send-link` with `{ kind, targetId, channel }`.
2. Server resolves the recipient:
   - For drop-in: `dropInBookings.userId` → `users.email` /
     `users.phone`. If the user is a minor (in practice not directly —
     drop-in is adult-only today, but rentals and rosters route through
     family_members; see below).
   - For rentals: `field_rentals.renterUserId` (if set) → users; else
     `field_rentals.renterEmail` / `renterPhone` (admin-typed contact).
   - For rosters (league players): the roster entry's
     `registrations.familyMemberId` → `family_members`. If
     `family_members.parentUserId` is set (a dependent), recipient is
     the parent's `users.email` / `users.phone`. If `selfUserId` is set
     (adult self), recipient is that user.
3. Server mints a `self_service_tokens` row:
   - `kind` matches the target.
   - `expiresAt = now + 6h`.
   - `sentVia` = channel.
   - Idempotent: if a live (unconsumed, unexpired) token already exists
     for the same `(kind, targetId)`, reuse it.
4. Build `url = ${PUBLIC_APP_URL}/self-serve/${token}`.
5. Dispatch:
   - `email`: Resend, simple plain-text template + a button link.
   - `sms`: Twilio, short message body.
   - `qr`: server doesn't send anything; response includes the URL, the
     manager island renders a fullscreen QR overlay using `qrcode` lib
     (already in repo? if not, add it as a dependency).
6. Response: `{ url, expiresAt, channel, recipient }` so the manager
   sees a confirmation toast (`"Sent to a***@b.com"` / `"Sent to (555)
   555-0145"` / fullscreen QR).

Errors:
- No recipient on file for the chosen channel → 422 with a clear
  message; manager flips to QR.
- Channel not configured (no Twilio/Resend keys) → 503 with the dev
  fallback (the URL is returned anyway; manager can copy/paste in
  development).

## Player self-service page at `/self-serve/[token]`

Public Astro page, `prerender = false`. Resolves the token server-side,
fetches the target row, renders an island with the outstanding items.

**Layout:**
- Header: `"Hi <name>"` and the booking/event one-liner ("Pickup Soccer
  at 6:00 PM at Worthington").
- Outstanding items as stacked cards, in order:
  1. **Sign waiver** — waiver text (read from `waivers` table, current
     org's "liability" type), accept checkbox, typed-name input
     pre-filled with the resolved signer name. Single button: **Save**.
  2. **Add photo** — `<input type="file" accept="image/*" capture="user">`
     wrapped as a "📷 Take photo" button. Live preview after capture.
     Save uploads to R2 and writes the URL to the right column
     (`users.avatarUrl` for adult-self booked rows / drop-in adult; the
     resolved `family_members.photoUrl` for dependents and roster
     entries).
  3. **Pay** — only when target is `walkin_session` and not yet paid.
     Embedded `<PaymentElement />` (mirrors the registration payment
     step component pattern). Connect-aware via venue's partner Stripe
     account. The walk-in booking row is created on the kiosk side
     before this surface is reached (see Section 7), so the
     PaymentIntent is tied to the existing row.
- Footer: "Aspire Sports · link expires <relative time>".

**API endpoints:**
- `GET /api/self-serve/[token]` — returns target context (the resolved
  signer name, the booking one-liner, outstanding items list, photo URL
  if present). Token validation: not consumed, not expired, kind +
  targetId match an existing row.
- `POST /api/self-serve/[token]/waiver` — `{ acceptedName: string }`.
  Writes `waiverSigned*` to the target row + appends a `consents` row
  (`type: "liability"`, `signedByUserId` if known). Returns the updated
  target row.
- `POST /api/self-serve/[token]/photo` — multipart. Uploads to R2 under
  `avatars/<userOrFamilyMemberId>/<timestamp>.jpg`, writes URL.
- `POST /api/self-serve/[token]/check-in` — sets `checkedInAt`. Used by
  the customer-dashboard variant (see Section 8); not exposed on the
  /self-serve page itself.
- `POST /api/self-serve/[token]/consume` — marks the token consumed
  once all outstanding items are done. Soft-consume: token stays valid
  for retries within the expiry window; `consumedAt` set on first
  full-completion.

**Token semantics:**
- Single token per `(kind, targetId)` while alive.
- Re-clicking "Send link" on the manager side reuses the live token
  (idempotent re-issue; doesn't generate new ones to clutter the table).
- Expiry: 6h. After expiry, the page renders "This link has expired —
  ask the front desk for a new one."
- The token does NOT authenticate the player for any other surface
  (e.g. doesn't sign them into `/dashboard`). It only operates on its
  target row.

## Venue kiosk at `/kiosk/[venueSlug]`

Public Astro page; authenticated as the venue via a slug in the URL
(simpler than a long-lived cookie; the slug is shared at venue
pairing time and isn't a secret — the kiosk doesn't have privileged
data, only today's bookings at this venue).

**Two paths from the kiosk landing:**

### Path A — Find my booking

Search box: name (any case-insensitive substring) or last 4 of phone.
`GET /api/kiosk/[venueSlug]/search?q=` returns today's bookings (and
parent-booked-for-kid rows where the parent's name or phone matches).
Each result is a row similar to the manager drawer, minus the action
buttons — clicking a result calls
`POST /api/kiosk/[venueSlug]/token-for-target` (kind + targetId in body)
which mints a fresh `self_service_tokens` row with
`sentVia: "kiosk_search"` and redirects to `/self-serve/[token]`. From
there, the flow is identical to the player-phone path.

### Path B — Walk-in registration

Single-page wizard:
1. **Pick session** — today's open drop-in sessions at this venue with
   available capacity. Each shown as a tappable card.
2. **Contact info** — name, email, phone, DOB. If DOB makes them a
   minor (under 18), the form asks for parent name + parent email/phone
   and that becomes the waiver signer.
3. **Waiver** — read + accept + typed signer name (parent for minors).
4. **Photo** — `<input type="file" capture="user">`.
5. **Pay** — embedded PaymentElement. Connect-aware. On success, the
   booking is confirmed and the manager dashboard auto-updates within
   5s (the new walk-in shows on the matching event card).

Server-side, the walk-in flow:
- Step 2 creates the booking row in `pending_payment` status, creates
  the `users` row (or matches an existing one by email) and the
  `family_members` row (for minors), and mints a self-service token of
  `kind: "walkin_session"` to carry context across the steps.
- Steps 3 + 4 write through the same `/api/self-serve/[token]/*`
  endpoints.
- Step 5 creates a PaymentIntent with `metadata.type =
  "dropin_walkin"`. The existing webhook handler for
  `payment_intent.succeeded` adds a new branch that confirms the
  booking row.

**Kiosk session safety:**
- The kiosk page calls `POST /api/kiosk/[venueSlug]/reset` on
  navigation/back/timeout. Clears the in-progress walk-in token.
- 2-min idle timeout returns to the kiosk landing page.

## Parent-signs-for-minor routing

A small server-side helper `src/lib/check-in/resolve-signer.ts`:

```ts
resolveSigner(kind, targetId): {
  signerName: string;         // displayed name on the waiver page
  recipientEmail: string|null;
  recipientPhone: string|null;
  recipientUserId: string|null;
  isMinor: boolean;
}
```

- **drop_in_booking**: signer is the booking's `users` row. (Drop-in is
  adult-only today; document the assumption — if youth drop-in ships
  later, this helper updates without endpoint changes.)
- **field_rental**: signer is `renterUserId`'s user OR the typed
  `renterName` / `renterEmail` / `renterPhone` (admin-created).
- **roster_entry**: load `registrations.familyMemberId` →
  `family_members`. If `parentUserId` set, signer is the parent
  (recipient = parent's email/phone, signerName = parent's name, but
  the page shows "Sign for <child name>"). If `selfUserId` set, the
  adult self.
- **walkin_session**: signer is whoever filled the contact form. If
  the form indicated a minor, parent fields are signer.

The drawer's send-link panel and the self-serve page both use
`resolveSigner` so the routing is consistent.

## Manager check-in vs. customer self-check-in

These are separate, idempotent writes to the same column
(`checkedInAt`) on the target row.

**Manager check-in:** drawer-row button → `POST
/api/admin/check-in/check-in` `{ kind, targetId }` → stamps
`checkedInAt = now`, `checkedInByUserId = managerUserId`. Polling
flips the drawer row to "Here ✓".

**Customer self-check-in:** on `/dashboard/bookings`, each upcoming
drop-in / rental row gets a "Check me in" button visible when within
the configured window (default ±60 min around the event start). Click
calls `POST /api/dashboard/check-in` `{ kind, targetId }` (auth: must
be the booking's `userId` or the family_member's `parentUserId`).
Stamps `checkedInAt`, leaves `checkedInByUserId` null.

The window is per-org config on `field_rental_rate_card` and an
equivalent column on `drop_in_rate_card` — `checkInWindowMinutes`
(default 60). New columns; small migration.

## Photo upload pipeline

- Client: `<input type="file" accept="image/*" capture="user">` →
  read as `File` → POST multipart to `/api/self-serve/[token]/photo`
  (or `/api/admin/check-in/upload-photo` when uploaded from the manager
  drawer).
- Server: max 5MB; image-only MIME; downscale to 1024px longest edge
  (sharp); JPEG quality 82; upload to R2 under
  `avatars/<userOrFamilyMemberId>/<timestamp>.jpg`; return the public
  URL. Write the URL to `users.avatarUrl` or `family_members.photoUrl`
  in the same transaction.
- Existing R2 client + the `R2_MOCK` test-mode pattern are reused. No
  new env vars expected (Stripe, R2, Resend, Twilio creds already
  configured in prod and CI).

## APIs (full list)

**Manager:**
- `GET /api/admin/check-in/day?venueId=&date=` — day view payload.
- `POST /api/admin/check-in/send-link` — `{ kind, targetId, channel }` → token + URL.
- `POST /api/admin/check-in/check-in` — `{ kind, targetId }` → stamp `checkedInAt`.
- `POST /api/admin/check-in/upload-photo` — multipart, `{ kind, targetId, file }` → updates the right photo column.

**Self-serve (public, token-authed):**
- `GET /api/self-serve/[token]` — context.
- `POST /api/self-serve/[token]/waiver` — `{ acceptedName }`.
- `POST /api/self-serve/[token]/photo` — multipart.
- `POST /api/self-serve/[token]/check-in` — used by the customer-dashboard variant.
- `POST /api/self-serve/[token]/consume` — final consume on completion.

**Kiosk (venue-slug-authed):**
- `GET /api/kiosk/[venueSlug]/search?q=` — today's bookings.
- `POST /api/kiosk/[venueSlug]/token-for-target` — `{ kind, targetId }` → token + URL.
- `POST /api/kiosk/[venueSlug]/walkin/start` — `{ sessionId, contact, dob, parent? }` → creates booking + family_member; returns walkin token + the URL.
- `POST /api/kiosk/[venueSlug]/walkin/payment` — `{ token }` → creates PaymentIntent for the walk-in; returns client secret.
- `POST /api/kiosk/[venueSlug]/reset` — kiosk session reset.

**Customer self-check-in (auth required):**
- `POST /api/dashboard/check-in` — `{ kind, targetId }` → stamps `checkedInAt`.

All admin endpoints gated by `requireAdminAccess` + `requireSameOrgVenue`.
All kiosk endpoints validated against the slug → venue → org chain; today's-bookings-only scope. All self-serve endpoints token-validated.

## Error handling

- Token expired / consumed: 410 Gone with a clear message page.
- Token kind/target mismatch (someone tampered): 404 Not Found (no leak).
- Photo too big / wrong MIME: 422 with size or type message.
- Stripe failure on walk-in payment: the row stays `pending_payment`,
  the expiry sweep (from Spec 1's pattern, generalized) eventually
  releases it. Player sees a "Payment failed — try again" with a retry
  button on the kiosk.
- Polling failure on the manager drawer: surface a small "Couldn't
  refresh — last updated <time>" indicator; don't break the drawer.

## Rollout

Schema change is additive (drop-in waiver columns + `self_service_tokens` +
two new rate-card columns). Phone normalization migration runs in the
same merge.

Feature stays dark by default at the route level (the `/admin/check-in`
nav link only appears when at least one venue at the org has at least
one event today AND the admin nav config flag is on). Twilio + Resend
+ R2 are already configured in prod, so no infra prep.

## Testing

**Unit** (`tests/unit/`):
- Phone normalize + format round-trip + edge cases.
- Token signing/verifying + expiry.
- `resolveSigner` for each of the four kinds.
- Day-view normalization (the merge of drop-in + rental + game rows
  into the shared shape).

**API** (`tests/api/check-in/`):
- Day endpoint: per-venue scoping, status mix.
- Send-link: each channel, idempotent re-issue, missing-recipient 422.
- Self-serve waiver + photo + check-in: token-valid, token-expired,
  token-consumed, kind-mismatch.
- Kiosk search + walkin-start + walkin-payment: venue-slug scoping,
  today-only filter, minor-flow creates family_member, pending_payment
  hold released on payment failure.
- Customer dashboard check-in: window check, auth check
  (booker-only or parent).
- All API tests follow the post-Spec-1 pattern: `getAdminCookie` /
  `getParentCookie` from `tests/api/setup/test-helpers.ts`,
  E2E_RENTAL_VENUE_ID + E2E_ORG_ID imports, unique-per-run slot
  helper for time-keyed rows, Stripe-not-configured defensive skip on
  paid paths.

**E2E** (`tests/e2e/`):
- Manager triggers SMS link, mocked Twilio captures the URL, Playwright
  navigates to it, signs the waiver, takes a photo (test fixture
  image), and the manager drawer reflects the change within 10s.
- Walk-in registration end-to-end on the kiosk URL: pick session,
  enter contact, sign, photo, pay (Stripe test mode), confirmation.

## Spec 1 seams used

- `field_rentals.waiverSigned/At/By` + `checkedInAt/By` — populated by
  this spec's send-link flow + manager check-in.
- `drop_in_bookings.checkedInAt` — populated by manager + customer
  self-check-in.
- `field_rentals` denormalized `renterName` + the
  `(venueId, startsAt)` index — used by the day-view query.
- Drop-in's own waiver columns (this spec's data-model section #1) —
  not previously shipped; this spec adds them.

## What this spec does NOT add (deliberately)

- A separate `venue_manager` role. Reuses admin access. If/when a
  dedicated role is needed, it's a future migration.
- Cross-venue day view ("everything everywhere today"). One venue at
  a time per page load.
- An archival path for old `self_service_tokens` rows beyond a periodic
  cleanup of expired/consumed rows — handled by a scheduled function
  mirroring the rental pending-payment expiry sweep.
- Auto-resend reminders if the player doesn't act on the first link.
  Manager can re-click the same channel; idempotent re-issue keeps a
  single live token.
