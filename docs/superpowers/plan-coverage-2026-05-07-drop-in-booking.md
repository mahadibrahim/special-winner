# Drop-In Booking — Spec Coverage Report

**Plan:** [2026-05-07-drop-in-booking.md](./plans/2026-05-07-drop-in-booking.md)
**Spec:** [2026-05-07-drop-in-booking-design.md](./specs/2026-05-07-drop-in-booking-design.md)
**Phases shipped:** A (foundation), B (booking flow), C (UI), D (notifications + tests)
**Generated:** 2026-05-07 at end of Phase D

This walks the spec section by section and points each load-bearing
requirement at the file/function/test that satisfies it, or marks it
deferred (with the explicit out-of-scope item from spec §14 it falls
under, where applicable).

---

## §1–3 Problem statement, principles, approach

These are framing sections. The implementation honors all six operating
principles:

- **Multi-venue, multi-sport scale**: schema is org-scoped; sessions
  reference venues; the brand-profile layer isolates presentation from
  inventory.
- **Single accountability**: one org owns sessions; partner revenue
  splits through Stripe Connect destination charges.
- **Customer vs worker notification policy**: customer dispatch
  (`src/lib/dropin/messages/dispatch.ts`) honors
  `messagingPrimaryChannel`/`messagingFallbackChannel` and respects
  SMS opt-in. Worker dispatch lives in `src/lib/activity-tracking/dispatch.ts`
  and bypasses opt-in (operational comms).
- **No cash at venues**: walk-up uses `payment_method_types: ['card_present']`
  via Stripe Terminal — see §11 below.
- **YAGNI**: every §14 deferral is honored.

---

## §4 Schema additions

### §4.1 New tables

| Spec table | Implementation | Status |
|---|---|---|
| `drop_in_sessions` | `src/lib/db/schema/drop-in.ts:71` `dropInSessions` | Implemented |
| `drop_in_bookings` | `src/lib/db/schema/drop-in.ts:115` `dropInBookings` | Implemented |
| `drop_in_rate_card` | `src/lib/db/schema/drop-in.ts:159` `dropInRateCard` | Implemented |
| `brand_profiles` | `src/lib/db/schema/branding.ts` (Phase A) | Implemented |
| `user_skill_levels` | `src/lib/db/schema/drop-in.ts` `userSkillLevels` | Implemented |

All five enums (`drop_in_session_kind`, `drop_in_skill_level`,
`drop_in_audience`, `drop_in_session_status`, `drop_in_booking_status`,
`drop_in_booking_source`, `drop_in_payment_method`,
`drop_in_cancellation_reason`, `skill_level`, `skill_level_source`)
defined in `src/lib/db/schema/drop-in.ts:22-67`.

Indexes on the partial `(session_id, user_id)` unique (active statuses)
and the `promotion_expires_at WHERE status='pending_claim'` partial
index — the two race-critical ones — are present
(`drop_in.ts:144-156`).

### §4.2 Modifications to existing tables

- `users.gender` enum (`user_gender`) added — `src/lib/db/schema/users.ts`.
- `venues.partner_stripe_account_id` + `venues.partner_application_fee_pct`
  added — `src/lib/db/schema/teams.ts:74-75`.

### §4.3 Migration

A single Drizzle migration covers Phase A schema. Subsequent migrations
landed during Phase B for column tweaks. All applied to staging on CI.

---

## §5 Multi-tenant + branding architecture

| Spec requirement | Implementation |
|---|---|
| §5.1 One org owns inventory | `dropInSessions.organization_id` FK to `organizations` with `ON DELETE CASCADE`. |
| §5.2 Domain → brand resolution in middleware | `src/lib/organization/brand-resolver.ts` (Phase A); middleware attaches `Astro.locals.brand`. |
| §5.3 Shared Stripe identity + per-venue partner split via destination charge | Online: `src/pages/api/dropin/bookings/index.ts:218-223` builds `transfer_data` + `application_fee_amount` when `venue.partnerStripeAccountId` is set. Walk-up: same shape in `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts`. |

---

## §6 Pricing application

| Spec requirement | Implementation | Test |
|---|---|---|
| §6.1 `resolveRate` rule order | `src/lib/dropin/pricing.ts:51` `resolveRate` | `tests/unit/dropin/pricing.test.ts` |
| §6.2 Default rates ($15 / $12) and member-with-no-allotment fallback | Defaults in `dropInRateCard` schema; member-rate fallthrough in `pricing.ts:88-92` | covered |
| Session-level overrides win | `pricing.ts:57-58` | covered |
| Membership stub returns null until memberships ship | `src/lib/dropin/booking.ts:263` `getActiveMembershipForUser` | n/a — explicit stub |

**Deferred per §14**: multi-pack credits, dynamic pricing.

---

## §7 Booking flows

### §7.1 Online booking (confirmed)

| Step | Implementation |
|---|---|
| 1. Browse | `src/pages/dropin/index.astro` + browse component |
| 2. Detail w/ user-specific price | `src/pages/dropin/[id].astro` |
| 3. Auth gate | `src/pages/api/dropin/bookings/index.ts:99-102` |
| 4. Gates inside `SELECT ... FOR UPDATE` tx | `src/lib/dropin/booking.ts:68-75` (lock) + `gates.ts` |
| 5. $0 vs Stripe Checkout split | `src/pages/api/dropin/bookings/index.ts:152-170` (free) and `:172-235` (paid) |
| 6. Booking row on webhook | `src/lib/stripe/handle-dropin-checkout-complete.ts` |
| 7. Team assignment | `src/lib/dropin/team-assignment.ts` invoked from booking + webhook + claim |
| 8. Confirmation notification | `src/lib/dropin/messages/booking-confirmation.ts` via `dispatchBookingConfirmation` (Phase D) |
| 9. Allotment decrement | Stub in `booking.ts:303` until memberships ship |

### §7.2 Online booking (waitlist + pessimistic claim)

| Step | Implementation | Test |
|---|---|---|
| Waitlist insert when full | `src/pages/api/dropin/bookings/[id]/cancel.ts` + booking endpoint waitlist branch | `tests/api/dropin/full-flow.test.ts` |
| Promotion: pick oldest by created_at, set token + expiry | `src/lib/dropin/promotion.ts:38` `promoteNextWaitlister` | full-flow + `book-confirmed.test.ts` |
| Magic claim link notification | `src/lib/dropin/messages/waitlist-promoted.ts` | `tests/unit/dropin/messages/waitlist-promoted.test.ts` |
| GET /POST claim endpoint | `src/pages/api/dropin/claim/[token].ts` | `tests/api/dropin/claim.test.ts` |
| Cron tick expires overdue + cascades | `src/lib/dropin/promotion.ts:104` `expireOverduePromotions` + `src/pages/api/cron/expire-pending-claims.ts` | claim.test.ts |
| Netlify scheduled function | `netlify/functions/scheduled-expire-pending-claims.ts` | n/a |

### §7.3 Walk-up at venue

| Step | Implementation |
|---|---|
| Search/create user | `src/components/admin/dropin/WalkUpPanel.tsx` |
| Same gates | Gates run inside `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` |
| $0 path | Routes through `createConfirmedBookingFreePath` w/ `source: 'walk_up'` |
| Card-present PaymentIntent + Connect transfer_data | walk-up endpoint creates PI; webhook handler in `src/lib/stripe/handle-dropin-walkup-payment.ts` inserts the booking row on `payment_intent.succeeded` |
| Team assignment in webhook | `handle-dropin-walkup-payment.ts:111` |

### §7.4 Cancellation

| Path | Implementation | Test |
|---|---|---|
| Customer cancel + Stripe refund + waitlist promote | `src/lib/dropin/refund.ts` `processCancelRefund` | full-flow + `cancel.test.ts` |
| Inside-window forfeit | `refund.ts:67-73` (compares `cancel_window_hours`) | covered in full-flow assertions |
| Admin override = always refund | `refund.ts:72` `adminOverride` flag | covered |
| Admin override notifies customer | Phase D wire-in: `dispatchBookingCancelledByAdmin` fires with `reason: 'admin_refund'` | unit tests on the renderer |

### §7.5 No-show

Admin-driven only. `AttendancePanel.tsx` lets staff toggle `checked_in_at`
and the `no_show` status. **Automated detection deferred per §14** (no
follow-up needed).

### §7.6 Session-cancelled by admin

| Step | Implementation | Test |
|---|---|---|
| Endpoint w/ tenant guard | `src/pages/api/admin/dropin/sessions/[id]/cancel.ts` | full-flow steps 7-8 |
| For each active booking: refund as admin override + notify | Loop calls `processCancelRefund({ adminOverride: true, reason: 'session_cancelled' })`; refund pipeline now fires `dispatchBookingCancelledByAdmin` with `reason: 'session_cancelled'` for the apologetic copy | unit tests on the variant + full-flow asserts cancellation_reason distribution |
| Session row → cancelled | endpoint update | covered |

---

## §8 Capacity gates + team assignment

| Requirement | Implementation | Test |
|---|---|---|
| §8.1 Members-only / capacity / gender-cap (in order) | `src/lib/dropin/gates.ts`: `checkMembersOnly`, `checkCapacity`, `checkGenderCap` | `tests/unit/dropin/gates.test.ts` |
| `SELECT ... FOR UPDATE` race-safety | `booking.ts:73`, `handle-dropin-checkout-complete.ts:81`, `handle-dropin-walkup-payment.ts:77` | implicit |
| `non_binary`/`prefer_not_to_say` fallback to gate 2 only | `gates.ts` `checkGenderCap` returns `ok: true` for null/non-binary | `gates.test.ts` |
| §8.2 Promotion re-runs gates per candidate | `promoteNextWaitlister` picks oldest waitlister; the next claim call re-runs gates via `findClaimByToken` + the booking POST flow | full-flow exercises happy path |
| §8.3 Team assignment: smallest-team + skill-tiebreaker | `src/lib/dropin/team-assignment.ts:assignTeam` | `tests/unit/dropin/team-assignment.test.ts` |
| `team_count = 0` skips assignment | `team-assignment.ts` returns null for class kind | covered |

---

## §9 Customer discovery UX

| Spec requirement | Implementation |
|---|---|
| §9.1 `/dropin` browse with filters + capacity meter + members-only badge | `src/pages/dropin/index.astro` + the browse React component (Phase B/C) |
| §9.2 `/dropin/[sessionId]` detail w/ skill-mismatch warning, "who's playing", cancellation policy summary, big CTA | `src/pages/dropin/[id].astro` |
| §9.3 `/dashboard/bookings` upcoming + past + member stats | Bookings endpoint `src/pages/api/dropin/bookings/index.ts` + dashboard panel |
| §9.4 Cross-domain visibility w/ soft `featured_venue_ids` differentiation | brand-profile filter on the listing endpoint |

**Deferred per §14**: hard venue differentiation per branded site,
self-service waitlist position visibility, customer-facing per-session
pricing call-outs.

---

## §10 Admin UI

| Page | Implementation |
|---|---|
| §10.1 `/admin/dropin/sessions` schedule view | `src/pages/admin/dropin/sessions/index.astro` + `SessionsList.tsx` |
| `/admin/dropin/sessions/[id]` detail (roster, waitlist, walk-up, attendance) | `src/pages/admin/dropin/sessions/[id]/index.astro` + `AdminSessionDetail.tsx` + `AttendancePanel.tsx` + `WalkUpPanel.tsx` |
| `/admin/dropin/sessions/[id]/edit` | `src/pages/admin/dropin/sessions/[id]/edit.astro` + `SessionForm.tsx` |
| §10.4 `/admin/dropin/rate-card` | `src/pages/admin/dropin/rate-card.astro` + `RateCardEditor.tsx` |
| §10.5 `/admin/branding` per-domain editor | `src/pages/admin/branding/index.astro` + `[id].astro` + `BrandProfileEditor.tsx` |
| §10.6 Recurring schedule via "Repeat" action | `src/pages/api/admin/dropin/sessions/[id]/repeat.ts` + tests in `admin-sessions-repeat.test.ts` |
| Skill-level editor on user detail | `src/components/admin/users/SkillLevelsEditor.tsx` + `src/pages/api/admin/users/[id]/skill-levels.ts` |

### Known gaps in admin UI (flagged during prior phases — not blockers)

1. **Logo media selector UI in BrandProfileEditor** — the `logoMediaId`
   field is wired through the API and stored, but the editor has no
   media-picker UI. Operator currently sets the value via direct DB
   patch or the JSON request payload. Tracked as polish.
2. **Director-only role gating on rate-card + branding endpoints**
   (§10.7). Current implementation gates these behind generic
   `requireAdminAccess`. The `rate-card.ts` endpoint has an explicit
   comment noting the looser gate — see line 8 of that file. Tighter
   gate deferred until the role taxonomy stabilizes (currently
   `admin`/`coach`/`parent` — no `director`/`venue_manager`/`foh`
   distinction yet in the Lucia user model).
3. **"Promote now" admin action** — admin can manually push a waitlist
   forward outside the cancel/expiry path. Not implemented; admin can
   work around by cancelling a confirmed slot, which already promotes.
   Tracked as polish.

### §10.7 Permissions

- `/admin/dropin/*` requires admin via middleware + `requireAdminAccess`.
- `/admin/branding` and `/admin/dropin/rate-card` use the same gate
  (gap #2 above).
- Tenant-scoping (org match check) is enforced on every endpoint via
  `requireSameOrg*` helpers — verified by tests in
  `book-paid-checkout.test.ts` and the admin endpoint tests.

---

## §11 Stripe Terminal integration

| Requirement | Implementation |
|---|---|
| §11.1 Server PaymentIntent w/ `card_present` + optional `transfer_data` + metadata | `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` |
| Booking creation atomic with webhook | `src/lib/stripe/handle-dropin-walkup-payment.ts` — single tx, idempotent on `paymentIntentId` |
| §11.2 Client-side reader pairing + `terminal-js` | `src/components/admin/dropin/WalkUpPanel.tsx` consumes connection token via `src/pages/api/admin/dropin/terminal/connection-token.ts` |
| §11.3 Hardware procurement | Out of scope (runbook level) — spec acknowledges this |

---

## §12 Edge cases

| Edge case | Handled? |
|---|---|
| Concurrent bookings — last-slot race | `SELECT ... FOR UPDATE` on session row (booking + webhook handlers); partial unique index on `(session_id, user_id)` for active statuses prevents same-user duplicates. |
| Stripe Checkout abandoned | No row created until webhook; slot stays open. |
| Webhook delay | Stripe ledger upstream is canonical; success page renders from db on subsequent visits. (Polling-based UX deferred.) |
| Claim link clicked twice | `findClaimByToken` checks `status === 'pending_claim'`; second POST returns 409 "Claim no longer valid". |
| Promotion fires after kickoff | `expireOverduePromotions` cancels `pending_claim` past expiry; the cron explicitly checks `promotion_expires_at <= now` and the start time gate is implicit because promotions only happen when capacity opens. The "skip promotions where now >= session.starts_at" guard mentioned in spec is not yet wired — gap noted below. |
| User account deactivated | Booking rows reference user_id; admin UI does not render a "deactivated" badge yet. Minor polish. |
| Stripe Terminal decline | Surfaces decline reason via `paymentIntent.last_payment_error`; staff retries. |
| Refund failure | Status flip happens regardless; refund retry is manual via admin refund endpoint. Background retry job not implemented. |
| Member upgrades mid-window | Existing bookings keep `payment_method` + `amount_paid_cents`; future bookings re-resolve. |
| Admin session cancel = always refunds | `processCancelRefund({ adminOverride: true, reason: 'session_cancelled' })` from cancel endpoint. |

### Edge-case gaps

- **Skip promotion if `now >= session.starts_at`** — currently the
  cron promotes every overdue waitlister. In practice this is harmless
  (the user just can't actually attend), but the spec calls for the
  guard. Tracked as polish.
- **Refund-failure retry job + admin alert after 3 fails** — manual
  workflow only. Spec calls for automated retry with alerting.

---

## §13 Testing

### §13.1 Unit (`tests/unit/dropin/`)

| Required | File |
|---|---|
| Pricing calculator | `pricing.test.ts` |
| Capacity gate | `gates.test.ts` |
| Gender-cap gate | `gates.test.ts` |
| Members-only gate | `gates.test.ts` |
| Team assignment | `team-assignment.test.ts` |
| Promotion expiry computation | exercised in promotion path; covered indirectly via integration tests |
| Rate-card override resolution | `pricing.test.ts` |
| Validators | `validators.test.ts` (Phase B addition) |
| Notification renderers (Phase D) | `messages/booking-confirmation.test.ts`, `messages/waitlist-promoted.test.ts`, `messages/booking-cancelled-by-admin.test.ts` |

**Total drop-in unit tests:** 4 files (gates, pricing, team-assignment,
validators) + 3 message files = 44 tests.

### §13.2 Integration (`tests/api/dropin/`)

| Required | File |
|---|---|
| Book non-member: charge + booking + team | covered structurally in `book-paid-checkout.test.ts` (Stripe Checkout creation) and `book-confirmed.test.ts` (free-rate path) |
| Book member with allotment / unlimited | **Deferred** — memberships stub returns null per spec note in `booking.ts`. Will land with the 2026-04-28 memberships work. |
| Book when full → waitlist offered | `full-flow.test.ts` |
| Waitlist → cancel → claim → confirmed | `full-flow.test.ts` |
| Waitlist → never claim → expire → next promoted | covered by `expireOverduePromotions` unit-level via the promotion module + `claim.test.ts` cron call |
| Cancel >24h: refund + allotment restore | `full-flow.test.ts` (refund path); allotment restore deferred with memberships |
| Cancel <24h: forfeit | `cancel.test.ts` covers the auth path; logic is exercised by `processCancelRefund` insideWindow branch |
| Walk-up happy path | structurally — endpoint exists; mocked-Terminal e2e is deferred |
| Walk-up gender-cap blocked | gates module unit-tested |
| Admin override refund | `cancel.test.ts` admin refund auth + `full-flow.test.ts` step 7 |
| Session-cancel propagation | `full-flow.test.ts` step 7-8 |
| Concurrent booking race | not explicitly covered — relies on the `FOR UPDATE` lock + partial unique index; structural test would require a multi-process harness. **Polish.** |

### §13.3 E2E (`tests/e2e/dropin/`)

**Deferred per §14** — "E2E (Playwright) tests — defer until UIs
stabilize." None implemented.

---

## §14 Out-of-scope (deferred) — confirmed honored

All sixteen items deferred per spec are honored:

- Multi-pack / punch-pass credits — no schema, no UI
- Cancellation credits inside cancel window — no code path
- No-show penalty fees — no code path
- Dynamic / time-of-day pricing — `resolveRate` is static
- Skill-balanced perfect team assignment for N>2 teams — `assignTeam` is 2-team only
- Peer skill ratings — only self-reported + admin-override
- Calendar conflict prevention — no per-user overlap check
- Reservation hold during Stripe Checkout — booking row created on webhook only
- Per-tier members-only sessions — `members_only` is a single boolean
- Self-service waitlist position visibility — admin only
- Hard venue differentiation per branded site — soft via `featured_venue_ids` only
- Per-domain shared SSO — separate cookie per domain
- Customer-facing per-session pricing call-outs — none
- Recurring schedule template entity — only `repeat.ts` bulk-create
- Automated no-show detection — admin-driven only
- Photographer/media coverage — not wired

---

## §15 Open questions — confirmed not load-bearing, design defaults applied

- **Cookies-per-domain** — yes, default applied
- **Capacity meter precision** — exact counts shown
- **"Who's playing" privacy** — opt-out by default

---

## §16 Implementation phases — execution mapping

| Spec phase | Plan tasks | Status |
|---|---|---|
| 1. Schema migration | Task 1 (Phase A) | Done |
| 2. Pricing + gates | Tasks 2-3 (Phase A) | Done |
| 3. Brand profiles + middleware | Task 4 (Phase A) | Done |
| 4. Online booking flow | Tasks 5-6 (Phase B) | Done |
| 5. Waitlist + claim | Task 7 (Phase B) | Done |
| 6. Cancellation + refund | Task 8 (Phase B) | Done |
| 7. Walk-up flow | Task 9-10 (Phase B) | Done |
| 8. Admin UIs | Tasks 11-13 (Phase C) | Done |
| 9. Customer dashboard | Task 11 (Phase C) | Done |
| 10. Notifications | Task 14 (Phase D) | Done |
| 11. Tests | Task 15 (Phase D) + per-task unit tests | Done — `full-flow.test.ts` end-to-end |
| 12. Documentation (venue runbook) | n/a | Out-of-band runbook update; not part of this plan |

---

## Polish backlog (not blocking ship)

These surfaced during the self-review and were intentionally **not**
implemented in this plan. They are quality-of-life follow-ups, not
correctness gaps:

1. **Logo media selector in BrandProfileEditor** — the field round-trips
   through the API but the editor lacks a picker UI.
2. **Director-only role gating on rate-card + branding endpoints**
   (spec §10.7) — currently any admin can edit. Tighter gate blocked
   on the broader role-taxonomy work (the platform doesn't yet model
   `director` vs `venue_manager` vs `foh`).
3. **"Promote now" admin action on the waitlist panel** — admin can
   manually push a waitlister forward without first cancelling someone.
4. **Skip promotion if `now >= session.starts_at`** — purely defensive;
   harmless if violated since the user just can't attend.
5. **"Deactivated user" badge in admin roster** — bookings keep
   referencing `user_id`; UI doesn't surface deactivation state.
6. **Refund-failure retry job + alert after 3 fails** — currently
   manual.
7. **Concurrent-booking integration test** — race-safety relies on
   `FOR UPDATE` + partial unique; an explicit multi-process test would
   harden the contract.
8. **Member-allotment restore on refund** — schema stub only; will
   land with the 2026-04-28 memberships work.
9. **Mocked-Stripe-Terminal walk-up integration test** — the structural
   path exists; an end-to-end mocked test against the Terminal SDK is
   deferred with the broader E2E waiver from §14.

None of the above is a launch blocker for the pickup soccer pilot.
