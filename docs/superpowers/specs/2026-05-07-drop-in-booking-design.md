# Drop-In Booking Model — Design Spec

**Date:** 2026-05-07
**Status:** Draft for review
**Owner:** Director (mahad@gmail.com); operating partner once delegated
**Scope:** Per-seat drop-in pickup soccer + drop-in classes (yoga, conditioning, single-session clinics). Hourly field/court rentals are explicitly out of scope — covered by `docs/design/2026-04-28-soccerone-data-model.md` in a separate workstream.

---

## 1. Problem statement

The platform currently supports league registration well, classes acceptably, and **drop-in booking not at all**. The existing `/soccerone/pickup.astro` marketing page sketches drop-in as walk-up "pay at the door" — a pre-internet model. Without online drop-in booking the operator can't:

- Capture demand from customers who decide last-minute and want a guaranteed spot
- Run capacity-bound sessions safely (oversold pickup nights are a known failure mode)
- Surface social proof (12/16 booked, 2 on waitlist)
- Collect prepaid revenue with cancel-window protection
- Enable membership benefits (free pickup for Founders) without staff manually checking lists at the door

This spec defines a per-seat drop-in booking model that runs alongside the existing leagues + classes platform, on the same multi-tenant org infrastructure, with the additional constraint that **two branded sites point at one shared inventory**: Aspire's main site and a SoccerOne-branded partner-facing site, both reading from the same `organization` row's session data.

---

## 2. Operating principles

These principles drive the design choices below; they apply project-wide and were established during prior brainstorms.

1. **Design for multi-venue, multi-sport scale** — repeatable patterns first, specializations bolted on
2. **Automate + systematize** as much as possible
3. **Single accountability** — one Stripe account collects, one org owns inventory
4. **Customer vs worker notification policy** — customers get channel-preference filtering and opt-in; workers get every channel for accountability
5. **No cash at venues** — all at-venue payments are Stripe Terminal card-present
6. **YAGNI ruthlessly** — multi-pack credits, dynamic pricing, no-show fees, peer ratings all deferred until usage data shows the need

---

## 3. Approach

A new `drop_in_*` schema layered alongside the existing `programs/seasons/teams/games` and the planned `bookable_resources/bookings` (rentals). The drop-in model uses its own session and booking tables because the SKU shape is fundamentally different from leagues (per-seat capacity vs roster-based teams) and rentals (per-bay reservation vs per-seat).

Two presentation domains (`aspiresportsohio.com` + `soccerone.com`, illustratively) resolve to the **same `organization` row** via the existing domain resolver. A new `brand_profiles` table layers per-domain visual customization on top — same data, different paint. The legal separation between Aspire LLC and the partner facility's LLC is real but deliberately kept out of the platform schema; revenue split flows through Stripe Connect destination charges with `transfer_data` pointing at the partner's connected account, configured per-venue.

The customer-facing flow is prepaid booking with hard-capped capacity, auto-promoting waitlist using the pessimistic claim model (30-minute window via magic link), and bib-color team assignment for pickup sessions. Walk-up registration is supported at the venue front desk via Stripe Terminal hardware.

---

## 4. Schema additions

### 4.1 New tables

```sql
-- One row per pickup or class session offering.
CREATE TYPE drop_in_session_kind AS ENUM ('pickup', 'class');
CREATE TYPE drop_in_skill_level AS ENUM ('recreational', 'intermediate', 'advanced', 'all_levels');
CREATE TYPE drop_in_audience AS ENUM ('adults', 'youth', 'all_ages');
CREATE TYPE drop_in_session_status AS ENUM ('scheduled', 'cancelled', 'completed');

CREATE TABLE drop_in_sessions (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venue_id                     uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  bookable_resource_id         uuid REFERENCES bookable_resources(id) ON DELETE SET NULL,
  kind                         drop_in_session_kind NOT NULL,
  sport_or_class_label         text NOT NULL,                              -- 'soccer', 'futsal', 'yoga', 'conditioning'
  format_label                 text,                                       -- '6v6', '60min flow', etc.
  starts_at                    timestamptz NOT NULL,
  ends_at                      timestamptz NOT NULL CHECK (ends_at > starts_at),
  capacity                     integer NOT NULL CHECK (capacity > 0),
  capacity_male                integer CHECK (capacity_male > 0),
  capacity_female              integer CHECK (capacity_female > 0),
  skill_level                  drop_in_skill_level NOT NULL DEFAULT 'all_levels',
  audience                     drop_in_audience NOT NULL DEFAULT 'adults',
  members_only                 boolean NOT NULL DEFAULT false,
  session_rate_cents           integer,                                    -- override; null = use org default
  member_rate_cents            integer,                                    -- override; null = use org default
  team_count                   integer NOT NULL DEFAULT 0,                 -- 0 = no teams (classes); 2 = pickup default
  team_colors                  text[] NOT NULL DEFAULT '{}',               -- ['orange', 'black']
  status                       drop_in_session_status NOT NULL DEFAULT 'scheduled',
  created_by_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gender_caps_paired CHECK (
    (capacity_male IS NULL) = (capacity_female IS NULL)
  ),
  CONSTRAINT team_colors_match_count CHECK (
    array_length(team_colors, 1) = team_count OR (team_count = 0 AND array_length(team_colors, 1) IS NULL)
  )
);

CREATE INDEX drop_in_sessions_org_starts_at_idx ON drop_in_sessions (organization_id, starts_at);
CREATE INDEX drop_in_sessions_venue_starts_at_idx ON drop_in_sessions (venue_id, starts_at);
CREATE INDEX drop_in_sessions_status_idx ON drop_in_sessions (status) WHERE status = 'scheduled';
```

```sql
-- One row per booking attempt (confirmed, waitlisted, pending claim, cancelled).
CREATE TYPE drop_in_booking_status AS ENUM (
  'confirmed', 'waitlisted', 'pending_claim', 'cancelled', 'no_show'
);
CREATE TYPE drop_in_booking_source AS ENUM ('online_booking', 'walk_up');
CREATE TYPE drop_in_payment_method AS ENUM (
  'card_online', 'card_present', 'member_unlimited', 'member_allotment'
);
CREATE TYPE drop_in_cancellation_reason AS ENUM (
  'user_request', 'no_show', 'admin_override', 'session_cancelled', 'expired_promotion'
);

CREATE TABLE drop_in_bookings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                   uuid NOT NULL REFERENCES drop_in_sessions(id) ON DELETE CASCADE,
  user_id                      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status                       drop_in_booking_status NOT NULL,
  source                       drop_in_booking_source NOT NULL,
  payment_method               drop_in_payment_method NOT NULL,
  amount_paid_cents            integer NOT NULL DEFAULT 0,
  membership_id                uuid REFERENCES memberships(id) ON DELETE SET NULL,
  stripe_payment_intent_id     text,
  stripe_refund_id             text,
  promoted_at                  timestamptz,
  promotion_expires_at         timestamptz,
  promotion_token              text,                                       -- signed token for claim link
  team_assignment              text,                                       -- 'orange' | 'black' | null for class
  checked_in_at                timestamptz,
  cancelled_at                 timestamptz,
  cancellation_reason          drop_in_cancellation_reason,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX drop_in_bookings_one_active_per_user_session
  ON drop_in_bookings (session_id, user_id)
  WHERE status IN ('confirmed', 'waitlisted', 'pending_claim');

CREATE INDEX drop_in_bookings_session_status_idx ON drop_in_bookings (session_id, status);
CREATE INDEX drop_in_bookings_user_status_idx ON drop_in_bookings (user_id, status, created_at DESC);
CREATE INDEX drop_in_bookings_promotion_expiry_idx
  ON drop_in_bookings (promotion_expires_at)
  WHERE status = 'pending_claim';
```

```sql
-- Org-level default rates + policy. Admin-editable.
CREATE TABLE drop_in_rate_card (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  default_session_rate_cents   integer NOT NULL DEFAULT 1500,              -- $15
  default_member_rate_cents    integer NOT NULL DEFAULT 1200,              -- $12
  cancel_window_hours          integer NOT NULL DEFAULT 24,
  promotion_window_minutes     integer NOT NULL DEFAULT 30,
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id           uuid REFERENCES users(id) ON DELETE SET NULL
);
```

```sql
-- Brand profile per domain. Layers visual customization on the
-- request without fragmenting data ownership.
CREATE TABLE brand_profiles (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain                       text NOT NULL UNIQUE,                       -- 'aspiresportsohio.com', 'soccerone.com'
  display_name                 text NOT NULL,
  logo_media_id                uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  hero_copy                    jsonb,                                      -- { title, subtitle, cta_label }
  color_tokens                 jsonb,                                      -- { primary, accent, surface, ink }
  footer_copy                  text,
  featured_venue_ids           uuid[] NOT NULL DEFAULT '{}',
  active                       boolean NOT NULL DEFAULT true,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX brand_profiles_org_active_idx ON brand_profiles (organization_id, active);
```

```sql
-- Self-reported skill rating per user per sport (with admin override).
CREATE TYPE skill_level AS ENUM ('recreational', 'intermediate', 'advanced');
CREATE TYPE skill_level_source AS ENUM ('self_reported', 'admin_assigned');

CREATE TABLE user_skill_levels (
  user_id                      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport                        text NOT NULL,                              -- matches drop_in_sessions.sport_or_class_label
  level                        skill_level NOT NULL,
  source                       skill_level_source NOT NULL,
  set_at                       timestamptz NOT NULL DEFAULT now(),
  set_by_user_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, sport)
);
```

### 4.2 Modifications to existing tables

```sql
-- Gender field on users (for gender-balanced caps).
CREATE TYPE user_gender AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender user_gender;

-- Per-venue partner Stripe Connect account ID for revenue split.
-- Null = no partner split (Aspire keeps 100%); non-null = transfer_data
-- routes the partner's slice via destination charge on every drop-in
-- (and rental) booking originating at this venue.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS partner_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS partner_application_fee_pct integer
    CHECK (partner_application_fee_pct BETWEEN 0 AND 100);
  -- partner_application_fee_pct is the % Aspire keeps; remaining %
  -- transfers to partner_stripe_account_id. Defaults to null (no split).
```

### 4.3 Migration

One Drizzle migration creates the four new tables, three new enums for users + drop-in domain, and adds the four new columns to existing tables. All defaults are backward-compatible (existing data needs no backfill; new columns nullable or with safe defaults).

---

## 5. Multi-tenant + branding architecture

### 5.1 Organization

One `organization` row owns the drop-in inventory. Multiple `domain_mappings` rows point to it (existing pattern); each domain also has a `brand_profiles` row controlling presentation.

### 5.2 Request resolution

```
Request comes in for soccerone.com/dropin
  ↓
Middleware (src/middleware.ts):
  1. Resolve org from hostname via domain_mappings → Aspire's org
  2. Resolve brand from hostname via brand_profiles → SoccerOne profile
  3. Attach both to Astro.locals: { organization, brand }
  ↓
Page renders:
  - Pulls drop_in_sessions for organization.id (same data either domain)
  - Header/footer/hero use brand.display_name, brand.logo, brand.color_tokens
  - Featured venues at top of list per brand.featured_venue_ids; rest still visible
```

### 5.3 Shared Stripe identity

All payments collect to Aspire's platform Stripe Connect account. For sessions at venues with a `partner_stripe_account_id` set, the Stripe Checkout / PaymentIntent is created as a destination charge with `transfer_data: { destination: partner_stripe_account_id }` and `application_fee_amount` computed from `partner_application_fee_pct`. The partner sees their share in their own Stripe Connect dashboard; Aspire keeps the platform fee.

For walk-up payments via Stripe Terminal, the same destination-charge mechanics apply — `payment_method_types: ['card_present']` with `transfer_data` configured per the venue.

---

## 6. Pricing application

### 6.1 Rate resolution per booking

```typescript
function resolveRate(session: DropInSession, user: User | null, rateCard: DropInRateCard): {
  amount_cents: number;
  payment_method: DropInPaymentMethod;
  membership_id: string | null;
} {
  const sessionRate = session.session_rate_cents ?? rateCard.default_session_rate_cents;
  const memberRate = session.member_rate_cents ?? rateCard.default_member_rate_cents;

  if (!user) {
    // Public listing display only — actual booking requires auth
    return { amount_cents: sessionRate, payment_method: 'card_online', membership_id: null };
  }

  const activeMembership = await getActiveMembership(user.id, session.organization_id);
  if (!activeMembership) {
    return { amount_cents: sessionRate, payment_method: 'card_online', membership_id: null };
  }

  const benefits = activeMembership.tier.benefits;
  if (benefits.unlimited_pickup) {
    return { amount_cents: 0, payment_method: 'member_unlimited', membership_id: activeMembership.id };
  }

  const allotmentRemaining = await getRemainingAllotmentThisMonth(activeMembership.id);
  if (allotmentRemaining > 0) {
    return { amount_cents: 0, payment_method: 'member_allotment', membership_id: activeMembership.id };
  }

  // Member with no allotment left → pay member rate
  return { amount_cents: memberRate, payment_method: 'card_online', membership_id: activeMembership.id };
}
```

### 6.2 Defaults

- Non-member: $15
- Member rate (after included sessions exhausted): $12
- Member with `unlimited_pickup: true`: free
- Member with `free_pickup_per_month: N`: free for first N bookings/month, then member rate

Admin can override defaults at org level (`drop_in_rate_card`) or per session (`drop_in_sessions.session_rate_cents` + `member_rate_cents`).

---

## 7. Booking flows

### 7.1 Online booking (confirmed)

1. Customer browses `/dropin` (branded path on either site)
2. Picks session → details page shows price applied to *this* user
3. Clicks Book; auth gate if not logged in
4. Server runs gates (members-only → capacity → gender-cap) inside a transaction with `SELECT ... FOR UPDATE` on the session row
5. Resolves rate (§6); `$0` paths skip Stripe and create the booking immediately; `> $0` redirects to Stripe Checkout (or embedded checkout per the 2026-05-03 GTM spec)
6. On `checkout.session.completed` webhook OR on $0 confirmation: create `drop_in_bookings` row with `status = confirmed`
7. Run team assignment algorithm (§8); set `team_assignment`
8. Send confirmation email + Telegram with team color
9. Decrement member allotment if `payment_method = member_allotment`

### 7.2 Online booking (waitlist + pessimistic claim)

When session is full at booking time:

1. Customer clicks "Join waitlist" → no payment, no card-on-file required
2. Server creates `drop_in_bookings` row with `status = waitlisted`, `amount_paid_cents = 0`

When a confirmed booking cancels (or admin opens slots):

1. Find first `waitlisted` row by `created_at` ascending
2. Update: `status = pending_claim`, `promoted_at = now()`, `promotion_expires_at = now() + rate_card.promotion_window_minutes`, generate signed `promotion_token`
3. Send notification (email + Telegram + SMS) with magic claim link: `https://<domain>/dropin/claim/<promotion_token>`
4. User clicks → server verifies token + window → presents pricing → routes through normal $0 or Stripe Checkout flow → on success: `status = confirmed`, run team assignment

When 30-minute window expires:

1. Cron tick (every 5 min, reuses activity-tracker scheduling infrastructure from Plan 2) finds rows where `status = pending_claim AND promotion_expires_at < now()`
2. Update: `status = cancelled`, `cancellation_reason = expired_promotion`, `cancelled_at = now()`
3. Promote next waitlister (recursion of step 1 above)

### 7.3 Walk-up at venue

Front desk via `/admin/dropin/sessions/[id]/walk-up`:

1. Search for existing user by phone or email; create new account if not found (name + email + phone + gender)
2. Server runs the same gates (members-only → capacity → gender-cap)
3. If member with $0 path: create booking immediately, `payment_method = member_unlimited` or `member_allotment`
4. If $ owed: server creates PaymentIntent with `payment_method_types: ['card_present']` and `transfer_data` if applicable; admin UI invokes Stripe Terminal SDK to prompt the paired reader; on success: create `drop_in_bookings` row with `source = walk_up`, `payment_method = card_present`
5. Run team assignment; display "✓ Sarah Chen — Team Orange" on screen; staff hands out the bib

### 7.4 Cancellation

Customer dashboard → "My bookings" → tap Cancel:

```
hours_until_session = (session.starts_at - now()) / 3600

if hours_until_session >= rate_card.cancel_window_hours (default 24):
  - If payment_method ∈ ('card_online', 'card_present'): refund via Stripe
  - If payment_method = 'member_allotment': restore allotment counter
  - status = 'cancelled', cancellation_reason = 'user_request'
  - Trigger waitlist promotion if applicable

else (< 24h or already started):
  - NO refund, NO allotment restoration
  - status = 'cancelled', cancellation_reason = 'user_request'
  - Trigger waitlist promotion if applicable

Admin override:
  - "Refund anyway" button bypasses policy
  - Logged in audit trail with reason text
```

For `member_unlimited`, no refund/restoration math is needed regardless of timing.

### 7.5 No-show

Currently admin-discretionary: front-desk marks attendance via session detail page during/after the session. Bookings without a `checked_in_at` post-session and without an explicit no-show flag are not automatically penalized. No-show fees and automated detection deferred per Q4.

### 7.6 Session-cancelled by admin

1. Admin clicks "Cancel session" → reason text required
2. For all `confirmed` bookings: refund full amount (no policy gate; admin-cancelled is always refunded), restore member allotments, send notification
3. For all `waitlisted` bookings: send notification, no money to handle
4. For all `pending_claim` bookings: cancel the promotion, no charge happened, send notification
5. `drop_in_sessions.status = cancelled`

---

## 8. Capacity gates + team assignment

### 8.1 Three gates at booking time

Applied in order inside a single Postgres transaction per attempt:

1. **Members-only** — if `session.members_only`, user must have an active membership in the org
2. **Capacity** — `count(confirmed bookings) < session.capacity`
3. **Gender-balanced cap** (if `capacity_male` and `capacity_female` both set) — count confirmed bookings of the user's gender; reject if at the per-gender cap

`SELECT ... FOR UPDATE` on the session row ensures race-safe capacity. Two simultaneous bookers cannot both grab the last slot.

`non_binary` and `prefer_not_to_say` users fall back to gate 2 only when gender caps exist (use any open slot regardless of cap segments).

### 8.2 Waitlist promotion + gender caps

Promotion logic re-runs the gates against the candidate. If the next waitlister fails a gate (e.g., male user, male cap full), skip them and consider the next waitlister. Skipped users keep their position; they get promoted when a slot fitting their gender opens.

### 8.3 Team assignment algorithm

Runs on every transition into `confirmed` (initial booking or waitlist promotion).

```
1. Count current confirmed bookings per team color for this session
2. Identify teams with the smallest count (tie possible)
3. Among ties:
   a. Compute the skill-balance score for each candidate team if this user joined
   b. Pick the team where adding this user produces the most balanced skill mix
4. Persist team_assignment
```

Skill balance = absolute difference of average skill rank between teams (recreational=1, intermediate=2, advanced=3, all_levels treated as 2). Lower = more balanced. The team that, when this user joins, results in the lowest absolute difference wins.

For sessions with `team_count = 0` (classes), no team assignment runs; `team_assignment` stays null.

When a confirmed user cancels and a promoted waitlister fills their spot, the new user gets a fresh team assignment — they don't inherit the cancelled user's color.

---

## 9. Customer discovery UX

### 9.1 Browse page

`/dropin` (or branded path like `/pickup` on SoccerOne site) — Astro shell + React `client:load` component:

- Default view: upcoming sessions across all venues for the next 14 days, sorted by `starts_at`
- Filter chips: sport, skill level, day, venue, audience
- Each session card: sport icon + format, date/time, venue + field, skill + audience badges, capacity meter, members-only badge, price applied to *this* user, primary CTA
- Mobile-first; cards stack vertically below `md` breakpoint

### 9.2 Session detail page

`/dropin/[sessionId]`:

- All info from the card, expanded
- Skill mismatch warning (soft) if user's self-reported level is one rank below session's
- "Who's playing" — first names + initial of confirmed bookers (privacy-respectful default opt-out via user setting)
- Cancellation policy summary
- Big primary CTA → checkout flow

### 9.3 Authenticated dashboard

`/dashboard/bookings`:

- Upcoming bookings (with cancel button + cancellation policy reminder)
- Past bookings (read-only history)
- Member stats if applicable: "Founder · unlimited pickup · 2 sessions this month"

### 9.4 Cross-domain visibility

Both branded sites show all sessions by default (soft differentiation via `featured_venue_ids`). Hard differentiation deferred — operator can switch a brand profile to "venues only" mode in a later release if the partner objects.

---

## 10. Admin UI

### 10.1 Page map

| Path | Purpose | Permissions |
|---|---|---|
| `/admin/dropin/sessions` | Schedule view; create/bulk-create sessions | Director, venue manager |
| `/admin/dropin/sessions/[id]` | Single session detail; roster, waitlist, walk-up flow, attendance | Venue manager, FoH for their venue |
| `/admin/dropin/sessions/[id]/edit` | Edit session details | Director, venue manager |
| `/admin/dropin/rate-card` | Org defaults + cancel/promotion windows | Director only |
| `/admin/branding` | Brand profiles per domain | Director only |
| `/admin/users/[id]` | Existing; extended with skill-level editor per sport | Director, venue manager |

### 10.2 Session detail page (the heaviest-used surface)

Header: session metadata + primary actions (Edit, Cancel session, Print roster).

Capacity card: confirmed count vs cap; per-gender breakdown if caps set; waitlist count.

Quick actions: "Add walk-up" (opens panel), "Mark attendance" (bulk check-in).

Roster: two columns for pickup (Orange / Black) or a flat list for class. Per-row: check-in toggle, no-show flag, refund + cancel, restore allotment, reassign team.

Waitlist: list with promote button per row.

### 10.3 Walk-up panel

Modal/side panel:

- Search by phone or email
- "Create new account" form if not found (name, email, phone, gender)
- Member status surfaced inline (tier name, allotment remaining, unlimited badge)
- Skill warning if mismatched
- "Register" button → triggers Stripe Terminal flow (or instant confirm for $0 paths)

### 10.4 Rate card editor

`/admin/dropin/rate-card` — single-form page with two number inputs (default rates), two number inputs (cancel window, promotion window), Save button. Last-saved-by audit trail.

### 10.5 Brand profile editor

`/admin/branding` — list of domains with active toggle. Per-domain edit:

- Display name
- Logo upload (uses existing media uploader)
- Hero copy fields (title, subtitle, primary CTA label)
- Color picker for token overrides
- Footer copy
- Featured venues selector
- Live preview pane

### 10.6 Recurring schedule

For MVP: "Repeat" action on the schedule view → modal "Repeat weekly until [date]?" → creates N independent copies. Editing one doesn't propagate to others. Proper recurring-template entity is deferred.

### 10.7 Permissions

- **Director**: all admin pages
- **Venue manager**: all `/admin/dropin/*` for their venues; not branding or rate card
- **Front-of-house**: only `/admin/dropin/sessions/[id]` for sessions at their venue today; can register walk-ups, mark attendance, no edit/cancel/refund

Follows the existing role system.

---

## 11. Stripe Terminal integration

Reader-agnostic: any Stripe-supported card-present reader works (BBPOS WisePOS E, Stripe Reader S700, Verifone P400, mobile readers). Hardware decision is procurement-time, not engineering-time.

### 11.1 Server side

Walk-up endpoint creates a PaymentIntent:

```typescript
const intent = await stripe.paymentIntents.create({
  amount: amount_cents,
  currency: "usd",
  payment_method_types: ["card_present"],
  capture_method: "automatic",
  ...(venue.partner_stripe_account_id ? {
    application_fee_amount: Math.round(amount_cents * (venue.partner_application_fee_pct ?? 0) / 100),
    transfer_data: { destination: venue.partner_stripe_account_id },
  } : {}),
  metadata: { session_id, user_id, source: 'walk_up' },
});
```

Returns `client_secret` to the admin UI.

### 11.2 Client side

Admin UI loads `@stripe/terminal-js`, connects to the venue's paired reader (one-time pairing per venue via Stripe dashboard), calls `terminal.collectPaymentMethod(clientSecret)` then `terminal.processPayment(paymentMethod)`. Reader prompts for tap/insert. On success, server-side webhook (`payment_intent.succeeded`) fires; the booking creation is atomic with the webhook handler.

### 11.3 Hardware as venue onboarding

Onboarding a venue requires: (1) Stripe Terminal reader procured and paired, (2) staff trained on use. Documented in the venue-onboarding runbook (out of scope for this spec).

---

## 12. Edge cases

- **Concurrent bookings**: row-level lock + transaction prevents double-claim of last slot
- **Stripe Checkout abandoned**: no booking row created; slot stays open; risk of another booker claiming it accepted
- **Webhook delay**: success-page polling for 60s; user-facing message if still missing
- **Claim link clicked twice**: idempotent; second click shows confirmation page
- **Promotion fires after kickoff**: cron skips promotions where `now() >= session.starts_at`
- **User account deactivated**: bookings keep referencing user_id; admin shows "(deactivated)" tag
- **Stripe Terminal decline**: surface decline reason; staff retries or refuses customer
- **Refund failure**: status flip happens; refund retries via background job; admin alert after 3 fails
- **Member upgrades mid-booking-window**: existing bookings stay as-charged; future bookings see new rate
- **Admin session cancellation**: full refunds + allotment restoration regardless of policy window

---

## 13. Testing

### 13.1 Unit tests (`tests/unit/dropin/`)

- Pricing calculator (member rate, allotment lookup, fall-through to member-after-allotment)
- Capacity gate (mocked transaction)
- Gender-cap gate
- Members-only gate
- Team assignment (smallest-team + skill tiebreaker)
- Promotion expiry computation
- Rate-card override resolution

### 13.2 Integration tests (`tests/api/dropin/`)

- Book non-member: charge created, booking confirmed, team assigned
- Book member with allotment: $0, allotment decremented
- Book member with unlimited: $0, no allotment math
- Book when full: blocked, waitlist offered
- Join waitlist → confirmed booker cancels >24h → claim link sent → claim completes booking
- Join waitlist → never claim → 30-min expires → next waitlister promoted
- Cancel >24h: refund issued; member allotment restored
- Cancel <24h: no refund, allotment lost
- Walk-up flow with mocked Stripe Terminal: happy path
- Walk-up flow gender-cap blocked
- Admin override refund
- Session-cancel propagation
- Concurrent booking race (only one wins, other gets 409)

### 13.3 E2E tests (`tests/e2e/dropin/`)

- Customer browse → book → pay → see in dashboard → cancel
- Waitlist join → notification (verify content via mailbox) → click claim → pay → confirmed
- Admin walk-up flow with mocked Terminal: open session → search → register → roster updates

---

## 14. Out of scope (deferred)

- Multi-pack credits / punch passes
- Cancellation credits (forfeit only inside window)
- No-show penalty fees / dropout penalties
- Dynamic / time-of-day pricing
- Skill-balanced perfect team assignment for N>2 teams
- Peer skill ratings (self-reported + admin override only)
- Calendar conflict prevention (don't let user book overlapping sessions)
- Reservation hold during Stripe Checkout
- Per-tier members-only sessions
- Self-service waitlist position visibility
- Hard venue differentiation per branded site
- Per-domain shared SSO via parent-domain cookies
- Customer-facing per-session-pricing call-outs
- Recurring schedule template entity (only bulk-create-from-template for MVP)
- Automated no-show detection
- Photographer/media coverage of pickup sessions (clean integration point with the activity tracker exists, not wired)
- Indoor/outdoor partner cross-listing across multiple partner orgs

---

## 15. Open questions

None load-bearing. Smaller items deferred during brainstorming:

1. **Cookies-per-domain vs shared SSO across branded sites** — start per-domain, revisit if friction emerges
2. **Capacity meter precision** — exact counts vs vague indicator; current spec says exact (matches market norm)
3. **Privacy default for "who's playing" listing** — current spec says opt-out (user can hide); could flip to opt-in if community feedback prefers

---

## 16. Implementation phases

The implementation plan (drafted separately via writing-plans) decomposes roughly into:

1. **Schema migration** — all new tables, enums, columns; one Drizzle migration
2. **Pricing + gate logic** — pure functions for rate resolution, all three gates, team assignment
3. **Bootstrap-side: brand profiles + middleware extension** — domain → brand resolution
4. **Online booking flow** — session listing, detail page, checkout, webhook handler, $0 paths
5. **Waitlist + pessimistic claim** — promotion cron, claim endpoint with token verification
6. **Cancellation + refund** — customer-facing cancel, admin override, member-allotment restoration
7. **Walk-up flow** — admin session detail page, walk-up panel, Stripe Terminal integration
8. **Admin UIs** — schedule view, rate card editor, brand profile editor, skill-level editor
9. **Customer dashboard** — bookings list, cancel actions
10. **Notifications** — email + Telegram + SMS for confirmation, waitlist promotion, cancel-by-admin
11. **Tests** — unit + integration + E2E
12. **Documentation** — venue-onboarding runbook update with Stripe Terminal section

The plan will follow the same TDD discipline as the activity-tracking-engine plan.
