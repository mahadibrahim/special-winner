# Rental Blocks — recurring multi-month field rentals with deposit collection

**Date:** 2026-08-14
**Branch:** `feat/rental-blocks` (worktree `.claude/worktrees/rental-blocks`, off `main` @ `c35022f0`)
**Status:** approved design, ready for implementation plan

## Problem

Winter rental inquiries are arriving at volume for the SoccerOne facilities, and
the system can't hold the shape of the deal being asked for. Three concrete
failures:

1. **No multi-month build-out.** Public online booking is hard-capped at 7 days
   ahead (`DEFAULT_BOOKING_WINDOW_DAYS`, 14 for Founder members, 90 ceiling), so
   winter dates are unpickable by design — "anything further out is a
   contact-the-venue conversation." The admin path is window-free but creates
   **one rental at a time**: a team wanting Tuesdays 8–9pm from January to March
   is 12 separate hand-built rentals, re-done by hand whenever anything moves.
2. **No deposit mechanism.** Rentals are all-or-nothing: `amount_due_cents` paid
   in full, or unpaid. There is no way to take a deposit that holds a block of
   inventory with a balance owed later. The admin `card_online` path can't even
   send a pay link today (the code comments it as "deferred to a follow-up").
3. **No inventory visibility.** Nothing answers "is Tuesday 8pm free all winter,
   and who else has asked for it?" — which matters because multiple parties are
   competing for the same prime slots *and* competing against facility-hosted
   programming (leagues, pickup, tournaments).

Out of the three intake pains identified, this spec covers **build-out,
deposits, and visibility**. Logging off-platform inquiries (calls, texts, DMs)
is deliberately deferred — see Non-goals.

## What already exists

The rental system is mature; this design adds a layer on top rather than
replacing anything.

- `field_rentals` with statuses `requested → pending_payment → confirmed`,
  plus `cancelled` / `completed` / `no_show`.
- Request → admin approve/decline → tokenized pay link → confirmation, with
  guest support via `rental_claim` tokens (`src/lib/rentals/claim.ts`).
- Conflict detection under a transaction-scoped advisory lock keyed on
  `(venueId, fieldNumber)` (`assertNoRentalConflict`).
- A field-time ledger (`src/lib/scheduling/blocks.ts`) carrying rentals, games,
  and manual blocks, with a field-resource hierarchy (`expandFamily`,
  `findRoot`) so a full field and its halves conflict correctly.
- Per-player waivers, check-in, reschedule, refunds, no-show.
- Two expiry sweeps: `expirePendingRentals` (payment holds) and
  `expireStaleRentalRequests` (unreviewed requests).
- Brand-aware pricing: SoccerOne uses seasonal × time-of-day tiers
  (`quoteRentalCents`), Aspire uses a flat hourly rate
  (`computeRentalPriceCents` + `resolveRentalHourlyRateCents`).

Current SoccerOne rate schedule (`RENTAL_RATE_SCHEDULE`, whole dollars per
hour):

| Season | before 3pm | midday (3–6pm) | evening (6pm+, and all weekend) |
|---|---|---|---|
| Summer (Apr–Sep) | $110 | $170 | $190 |
| Winter (Oct–Mar) | $130 | $185 | $260 |

## Non-goals

Explicitly out of scope for this build:

- Public months-ahead self-serve booking. The 7-day window stays as-is.
- An inquiry/lead pipeline (logging calls, texts, DMs; the `[rental-package]`
  rows currently landing in `corporate_inquiries` with no admin UI). Revisit
  once the builder is in use and we know whether intake is still the bottleneck.
- Auto-charging a saved card for the balance.
- Splitting the balance into monthly installments.
- ICS/calendar invites on confirmation.
- Drag-to-create on the calendar. Read-only in v1.

## Design

### 1. Data model

**A new parent table `field_rental_blocks`; child sessions stay ordinary
`field_rentals` rows** carrying a `block_id` FK.

This is the load-bearing decision. Because a block session *is* a rental, every
existing mechanism keeps working untouched: the advisory-lock conflict check,
the ledger, availability, check-in, per-player waivers, single-session
reschedule, no-show, refunds. Nothing downstream has to learn a new shape.

```
field_rental_blocks
  id                       uuid pk
  organization_id          uuid not null → organizations (cascade)
  location_id              uuid not null → locations (restrict)
  brand                    varchar(20) not null default 'soccerone'
  label                    text not null          "Ohio Elite 03B — Winter Tuesdays"

  renter_user_id           uuid null → users (set null)
  renter_name              text not null
  renter_email             text null
  renter_phone             text null
  party_size               integer not null default 1
  purpose                  text null
  notes                    text null              -- internal

  pattern                  jsonb null             -- generator input, kept for drafts
  subtotal_cents           integer not null default 0
  discount_kind            varchar(10) null       -- 'percent' | 'amount'
  discount_value           integer null           -- 10 (percent) | 30000 (cents)
  total_cents              integer not null default 0

  deposit_pct_snapshot     integer null           -- 25, snapshot at send time
  deposit_due_cents        integer not null default 0
  deposit_paid_at          timestamptz null
  deposit_expires_at       timestamptz null       -- hold window on the whole block
  stripe_deposit_pi_id     text null

  balance_due_cents        integer not null default 0
  balance_due_at           timestamptz null
  balance_paid_at          timestamptz null
  stripe_balance_pi_id     text null
  last_reminder_at         timestamptz null
  reminder_stage           varchar(20) null       -- 't14' | 't3' | 'overdue'

  status                   field_rental_block_status not null default 'draft'
  offline_payment_method   field_rental_payment_method null  -- when marked paid offline
  cancelled_at             timestamptz null
  created_by_user_id       uuid null → users (set null)
  created_at, updated_at   timestamptz not null default now()

  indexes:
    (organization_id, status)
    (location_id, status)
    (balance_due_at) where status = 'active' and balance_paid_at is null
```

New enum `field_rental_block_status`: `draft | awaiting_deposit | active |
completed | cancelled`.

`field_rentals` gains `block_id uuid null → field_rental_blocks (set null)`
plus an index on `(block_id, starts_at)`.

`field_rental_rate_card` gains four columns:

| Column | Default | Meaning |
|---|---|---|
| `deposit_pct` | 25 | Deposit as a percent of block total; overridable per block |
| `balance_due_lead_days` | 30 | Balance due this many days before the first session |
| `block_hold_hours` | 72 | How long an unpaid `awaiting_deposit` block holds its slots |
| `quote_marker_ttl_days` | 14 | How long a draft's soft-hold markers stay visible |

**Location, not venue, is the block's scope.** SoccerOne models each physical
field as its own `venues` row (Orange and Blue at Worthington, Yellow
downtown), resolved by location slug via `getRentalVenuesByLocation`. So
"multiple fields in one session" means multiple venue rows, and scoping a block
to a single venue would make multi-field blocks impossible. Each session row
carries its own `(venue_id, field_number)` exactly as rentals do today, which
also still works for venues that carry several numbered fields via
`venue_resources`.

A block spanning Worthington *and* Downtown is two blocks.

#### Money is whole dollars

Storage stays integer cents — Stripe's API takes only integer minor units, and
every money column in the schema is already cents. But **all block money is
constrained to whole dollars** (every stored value a multiple of 100):

- Admin inputs are whole dollars; no cents field exists in any form.
- Discount is a percent or a whole-dollar amount.
- Deposit rounds to the nearest whole dollar.
- Per-session allocation is whole dollars; any remainder dollars land on the
  first session so the parts sum **exactly** to `total_cents`.
- Display is `$2,808`, never `$2,808.00`.

The existing rate schedule is already whole dollars, so nothing forces a cent
into the arithmetic.

Worked example — Tuesday 8–9pm, Jan 6 to Mar 24, winter evening rate:

```
12 sessions × $260                    $3,120
Bulk discount −10%                   −$  312
Block total                           $2,808
Deposit 25%                           $  702
Balance                               $2,106   due 30d before first session
Per session (derived)                 $  234
```

With a skipped week and a flat discount, showing the remainder rule:

```
11 sessions × $260                    $2,860
Bulk discount −$300                  −$  300
Block total                           $2,560
Deposit 25% → $640                    $  640
Per session $232 × 11 = $2,552; remainder $8 → first session $240
```

#### The block row is the payment source of truth

Sessions store their own pro-rated `amount_due_cents`, but keep
`amount_paid_cents = 0` and `payment_status = 'unpaid'` until the block is
fully paid, at which point all sessions flip to `paid`. Session detail shows
"part of block *<label>*" and links up.

The rejected alternative — allocating the deposit to the earliest sessions as
fully paid — reads better in per-session revenue reports but makes partial
refunds and mid-block cancellations genuinely confusing. Block-level truth is
the deliberate call.

### 2. The builder

Route `/admin/rentals/blocks/new`. One page, four panels — not a wizard,
because you need the pattern, the sessions, and the money visible at once while
someone is on the phone.

**The recurring rule is only a generator.** It produces a draft session list,
and *that list is directly editable*. This single mechanism covers skip-dates,
multiple days per week, multiple fields per session, and varying times per day
without modeling any of them as rules.

```
① RENTER     label · name · email · phone · party size · purpose · internal notes
             email lookup → links an existing user, else guest

② PATTERN    Storefront: SoccerOne ▾    Location: Worthington ▾
             [Tue ▾] [8:00 PM] [1.0 hr]  fields ☑ Orange ☐ Blue
             [Thu ▾] [9:00 PM] [1.5 hr]  fields ☑ Orange ☐ Blue   [+ add day]
             Jan 6 ──→ Mar 24                              [ Generate ]

③ SESSIONS   20 of 23 selected
   ☑ Tue Jan 6   8:00–9:00 PM    Orange   $260
   ☑ Thu Jan 8   9:00–10:30 PM   Orange   $390
   ☐ Tue Feb 17  8:00–9:00 PM    Orange     —   ⚠ Winter Cup game
   ☐ Thu Feb 26  9:00–10:30 PM   Orange     —   ⚠ held by another rental
   ☑ …                                          [+ add a one-off session]

④ PRICE      Subtotal (rate card)               $5,460
             Discount  [10] % ▾                 −$  546
             Block total                         $4,914
             Deposit   [25] %                    $1,229    hold [72] hrs
             Balance   $3,685  due [Dec 7]  (first session − 30 days)

             [ Send deposit link ]  [ Mark paid offline ]  [ Save draft ]
```

Unchecking a row skips that week. Editing a row's time or field expresses
"Thursday runs at 9:00" and "Saturday takes three fields". Conflicting rows come
back **auto-unchecked with the reason** read from the ledger (rental / game /
internal reserve / another quote).

**Storefront drives branding *and* pricing.** Brand is not derivable from the
venue — there is no brand column, SoccerOne is a skin over the same org, and
brand normally comes from the request host. An admin building from the Aspire
admin host would otherwise get `locals.brandId === "aspire"` and miss the
seasonal winter tiers entirely. So the Storefront select is explicit
(default SoccerOne) and picks both the email branding and the pricing engine:
`quoteRentalCents` for SoccerOne, `computeRentalPriceCents` +
`resolveRentalHourlyRateCents` for Aspire.

**DST is load-bearing.** A winter block crosses the November fallback. "Tue
8:00 PM" must be resolved per-date in the org timezone via the existing
`zonedMinuteToUtc`; generating by adding 7 × 24h would silently shift half the
sessions by an hour. Unit-tested across both the November and March
transitions.

**What each commit action creates:**

| Action | Block status | Session rows | Ledger |
|---|---|---|---|
| Save draft | `draft` | none | expiring quote markers |
| Send deposit link | `awaiting_deposit` | all sessions, `pending_payment`, `payment_expires_at = now + block_hold_hours` | firm holds |
| Mark paid offline | `active` | all sessions, `confirmed`, `payment_status = paid` | firm holds |

A session's `field_number` comes from the chosen venue's `venue_resources`
enumeration — `1` for the one-field-per-venue SoccerOne venues, and the
selected numbered field for venues that carry several.

**Commit is all-or-nothing.** Block plus every session are created in one
`db.transaction`, taking the advisory lock per `(venue_id, field_number)` in a
deterministic order (venue id, then field number) so two admins building
overlapping blocks cannot deadlock. Each session is re-checked inside that
transaction with **both** `assertNoRentalConflict` (same check the public path
uses) and `assertNoBlockConflict` against the ledger — the latter is what
respects the field-resource hierarchy (a full field vs its halves) and internal
reserves. If anything got taken between Generate and Send, the create fails and
names the newly-conflicting sessions rather than committing 19 of 20 and
leaving the money math wrong.

Ledger blocks are synced after insert via the existing `withLedgerSync` /
`upsertSourceBlock` path.

#### Internal reserve mode

`/admin/rentals/blocks/new?internal=1` reuses the same generator and session
list, but commits **manual ledger blocks** (`createManualBlock`) instead of
rentals and hides every money panel. This is how prime inventory gets fenced
off for facility-hosted programming — "reserve Tue/Thu 8–10pm for winter league
for 14 weeks" in one action — before anyone gets quoted. The builder then
surfaces those reserves as conflicts with their label.

### 3. Contention: soft holds, visible, non-blocking

Drafts hold nothing firm, but they are not invisible.

Saving a draft writes expiring **quote markers** to the ledger
(`quote_marker_ttl_days`, default 14). Markers never block anyone — they surface
in the builder and the calendar as "also quoted to *X* · Nov 1", so whoever
builds the next block sees the contention. Sending a deposit link upgrades the
block's slots to a **firm hold** for `block_hold_hours`; paying the deposit
confirms them.

```
Nov 1   Draft A (Ohio Elite)   Tue 8pm  → quote marker
Nov 3   Draft B (FC Rush)      same slot → ⚠ "also quoted to Ohio Elite · Nov 1"
Nov 5   A: Send deposit link             → FIRM hold, 72h
Nov 6   B: Send deposit link             → blocked; must requote
Nov 7   A pays deposit                   → 12 sessions confirmed
```

**Drafts go stale, and the UI says so.** A draft priced on November 1 holds
nothing, so opening it re-runs the availability check and shows what changed
since it was built (newly conflicting sessions, expired markers, rate changes),
with a one-click re-generate. Drafts store the generator input plus the
admin's per-row edits in `blocks.pattern` (jsonb) rather than creating session
rows; the quote markers are written from that same generated list at save time
and rewritten whenever the draft is saved again.

### 4. Money and lifecycle

**One public page carries the whole renter side:** `/rentals/blocks/[token]`,
reached from a tokenized email link via a new `rental_block_claim` token kind
(same `mintToken` mechanism as the existing rental claim links, TTL outliving
the hold and the reminder schedule). **No account required** — these renters
arrive from a text message, not a signup. The page shows the full session
schedule, the total, what's owed now, and a Pay button; it serves the deposit
first, then the balance, then acts as the receipt.

**Deposit → confirmed.** `POST /api/rentals/blocks/:id/deposit-session` mints a
Stripe Checkout Session on demand (the same on-demand pattern as
`bookings/:id/pay`, so a stale link can't outlive a Stripe session). Metadata
carries `type: field_rental_block_deposit` and the block id. A new
`handle-field-rental-block-deposit-complete.ts` webhook handler, in one
transaction:

1. block → `active`, `deposit_paid_at` set, `stripe_deposit_pi_id` recorded
2. every session `pending_payment` → `confirmed`
3. ledger holds upgraded to firm
4. `balance_due_at` = first session − `balance_due_lead_days`
5. quote markers for this block removed
6. brand-aware confirmation email with the full session schedule

**Balance.** Same page, second link. A `rental-block-balance-reminders` cron
fires at T−14 and T−3 days, then flags **overdue** in admin at T+1. No
auto-cancel — cancelling a paid-deposit winter block automatically is never the
right default. Admin also gets a "Send balance link now" button. Paying the
balance sets `balance_paid_at` and flips every session's `payment_status` to
`paid`.

**Offline payment.** "Mark paid offline" records
`offline_payment_method` (`cash` | `comp`), skips Stripe entirely, and confirms
the block and all sessions immediately — mirroring
`createConfirmedRentalNonStripe`.

#### Three hazards designed against explicitly

**The existing expiry sweep would eat block sessions one at a time.**
`expirePendingRentals` cancels any `pending_payment` row past its expiry, which
unmodified would silently cancel individual sessions of an unpaid block and
leave a live deposit link pointing at a half-destroyed schedule. Fix: that
sweep gains `block_id IS NULL`, and a new block-level
`expireUnpaidRentalBlocks` cancels an `awaiting_deposit` block past
`deposit_expires_at` **together with all its sessions**, frees the ledger, and
notifies the admin. This needs a regression test.

**Losing a race after the link is out.** Conflicts are re-checked both when the
Checkout Session is created and inside the webhook transaction. If a block
loses its slots between link and payment, the deposit is refunded immediately,
the block goes `cancelled`, and both admin and renter are notified — rather
than confirming a booking on top of someone else's.

**Brand on admin-created rentals.** The current admin create path hard-defaults
`brand: "aspire"` with a comment marking SoccerOne branding as a follow-up.
Since this entire feature serves the SoccerOne site, blocks set `brand` from
the Storefront select, closing that follow-up for the block path.

#### Cancellation and changes

Block detail can **cancel remaining sessions** from a date forward. The
suggested refund is the sum of the cancelled sessions' allocated whole-dollar
amounts, capped at what has actually been paid; the admin confirms a
whole-dollar amount, and the existing `src/lib/rentals/refund.ts` issues it
against the deposit and/or balance payment intents.

Single-session reschedule, no-show, check-in, and per-player waivers all keep
working through the existing per-session endpoints. Rescheduling a session
inside a block does not change block money. A block moves to `completed` when
its last session has ended and the balance is paid.

### 5. Seeing the inventory

One new org-scoped endpoint,
`GET /api/admin/rentals/calendar?locationId&from&to`, generalizes the existing
`getBlocksForVenueDay` to a date range and returns confirmed rentals, scheduled
games, internal reserves, and quote markers in one pass — so contention and
facility programming appear in the same picture as rentals. Read-only in v1.

Two views at `/admin/rentals/calendar`:

**Recurring-slot finder** — the thing that actually answers a winter inquiry.
Pick location, day-of-week, time, and date range; get per-field occupancy
across the whole range at a glance. It is nearly free to build: the builder's
generator with the money panels off.

```
FINDER   Worthington · Tue · 8–9pm · Jan 6 – Mar 24
  Orange  ●●●●●○●●△●●●    9 open · 1 game · 1 quoted
  Blue    ●●●●●●●●●●●●   12 open
  Yellow  ■■■■■■■■■■■■   reserved — winter league
```

**Month grid** — per location, each day cell showing per-field prime-time fill,
clicking through to an hour × field day detail.

### 6. Surfaces

```
/admin/rentals                    existing session list, + "Block" column linking up
/admin/rentals/blocks             Blocks tab — renter, pattern, sessions, paid/total,
                                  balance due, ⚠ overdue
/admin/rentals/blocks/new         the builder  (?internal=1 → reserve mode, no money)
/admin/rentals/blocks/[id]        block detail + actions
/admin/rentals/calendar           finder + month grid
/admin/rentals/rate-card          + deposit %, balance lead days, block hold hours,
                                  quote-marker TTL
/dashboard                        MyFieldRentals groups block sessions, "Pay balance"
/rentals/blocks/[token]           public quote → deposit → balance → receipt
```

The existing flat session list is **not** collapsed into block rows — staff use
it as the day-of-play view. It only gains a linking column.

Block detail actions: send deposit link, send balance link, mark paid offline,
add a session, cancel remaining, refund, re-check availability (drafts).

### 7. File layout

Logic split into focused files, per the repo's decomposition convention:

```
src/lib/db/schema/field-rental-blocks.ts
src/lib/rentals/blocks/generate.ts        pattern → session list (pure, DST-aware)
src/lib/rentals/blocks/pricing.ts         subtotal · discount · deposit · allocation
                                          (pure, whole dollars)
src/lib/rentals/blocks/create.ts          transactional commit + advisory locks
src/lib/rentals/blocks/quote-markers.ts   soft holds
src/lib/rentals/blocks/lifecycle.ts       deposit · balance · expire · cancel · complete
src/lib/rentals/blocks/messages.ts        quote · deposit · balance · confirmation
                                          (brand-aware)

src/components/admin/rentals/blocks/BlockBuilder.tsx
src/components/admin/rentals/blocks/PatternPanel.tsx
src/components/admin/rentals/blocks/SessionTable.tsx
src/components/admin/rentals/blocks/PricePanel.tsx
src/components/admin/rentals/blocks/BlocksList.tsx
src/components/admin/rentals/blocks/BlockDetail.tsx
src/components/admin/rentals/RecurringSlotFinder.tsx
src/components/admin/rentals/RentalCalendar.tsx

src/pages/api/admin/rentals/blocks/index.ts            list · create
src/pages/api/admin/rentals/blocks/[id].ts             read · patch · cancel
src/pages/api/admin/rentals/blocks/[id]/deposit-link.ts
src/pages/api/admin/rentals/blocks/[id]/balance-link.ts
src/pages/api/admin/rentals/blocks/[id]/sessions.ts    add · remove a session
src/pages/api/admin/rentals/blocks/generate-preview.ts pattern → priced session list
src/pages/api/admin/rentals/calendar.ts
src/pages/api/rentals/blocks/[id]/deposit-session.ts
src/pages/api/rentals/blocks/[id]/balance-session.ts
src/pages/api/cron/rental-block-reminders.ts
src/pages/rentals/blocks/[token].astro
netlify/functions/scheduled-rental-block-reminders.ts
src/lib/stripe/handle-field-rental-block-deposit-complete.ts
src/lib/stripe/handle-field-rental-block-balance-complete.ts
```

`generate.ts` and `pricing.ts` being pure is what makes the DST and
whole-dollar rules cheaply unit-testable.

Every admin endpoint validates tenant ownership through the `requireSameOrg*`
helpers in `src/lib/auth/require-resource-ownership.ts`. Admin pages are SSR
(no `prerender`), as is `/rentals/blocks/[token]` (it reads a route param and
request-time state).

### 8. Migrations

**Two additive migrations**, because the repo rule is that adding an enum type
ships on its own (the 55P04 lesson from `0097`/`0098`):

1. `NNNN_rental_block_status_enum.sql` — `field_rental_block_status` only,
   written idempotently (`DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN
   duplicate_object THEN null; END $$;`).
2. `NNNN_rental_blocks.sql` — `field_rental_blocks` table,
   `field_rentals.block_id` + index, the four `field_rental_rate_card` columns,
   all with `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.

Generated via `npm run db:generate` and committed. Nothing destructive; all
forward-compatible.

## Testing

**Unit** (`tests/unit/rentals/blocks/`)

- `generate.ts`: multiple days per week, per-day times and durations, multiple
  fields per session, excluded dates, date-range boundaries.
- `generate.ts` DST: a block crossing the **November** fallback and one
  crossing the **March** spring-forward both keep their local wall-clock time.
- `pricing.ts`: seasonal subtotal against the real rate schedule; percent and
  flat discounts; deposit rounding to a whole dollar; per-session allocation
  summing **exactly** to `total_cents` with the remainder on the first session;
  every stored value a multiple of 100.
- `balance_due_at` derivation from first session − lead days.

**API** (`tests/api/rentals/blocks/`)

- Create: happy path, conflict rejection naming the conflicting sessions,
  all-or-nothing atomicity, advisory-lock ordering under concurrency.
- Deposit: checkout session creation, webhook flipping every session to
  `confirmed` and setting `balance_due_at`, idempotency on webhook replay.
- Balance: link creation, payment flipping session `payment_status` to `paid`.
- Expiry: `expireUnpaidRentalBlocks` cancels block + all sessions and frees the
  ledger; **regression test that `expirePendingRentals` no longer touches rows
  with a `block_id`**.
- Quote markers: visible to a competing build, non-blocking, expire on TTL.
- Guest token page: access without an account, expiry behaviour.
- Tenant isolation on every admin endpoint.
- Reminder cron at T−14 / T−3 / overdue, and that it never auto-cancels.

**E2E** (`tests/e2e/rental-blocks.spec.ts`)

Admin builds a 12-session block → sends the deposit link → token page → pays
with `4242` → 12 confirmed sessions appear in the admin list. Uses
`waitForHydration(page)` before any interaction, per the repo's Playwright
convention.

Full Playwright only runs post-merge here via `test-full`, so
`tests/e2e/field-rentals.spec.ts` and
`tests/e2e/soccerone-rental-pricing.spec.ts` must be checked for anything these
changes break, and run locally before merge.

**Pre-push:** committed migration, `npm run build`, `npx tsc --noEmit` at zero
errors.

## Rollout

Built in the `feat/rental-blocks` worktree off `main`. The primary checkout
stays on `feat/seo-content-phase-a` (141 commits behind main) and is not
touched, per the repo's branch-hygiene rule.

No feature flag — every surface is additive: new admin routes, a new public
token page, and one new nullable column on `field_rentals`.

Four waves:

1. Schema + migrations + pure logic (`generate.ts`, `pricing.ts`) with unit
   tests.
2. Builder: generate-preview endpoint, create endpoint, `BlockBuilder` and
   panels, blocks list, block detail. Internal reserve mode.
3. Lifecycle: deposit link, token page, webhooks, balance, reminders cron,
   block-aware expiry (including the `expirePendingRentals` fix), cancel and
   refund.
4. Visibility: calendar endpoint, recurring-slot finder, month grid, rate-card
   fields, dashboard grouping.

## Open items for the owner

- Confirm `deposit_pct` = 25%, `balance_due_lead_days` = 30,
  `block_hold_hours` = 72, `quote_marker_ttl_days` = 14 as the starting
  defaults. All are rate-card editable after launch.
- Confirm whether Downtown (Yellow) blocks should also default to the
  SoccerOne storefront, or whether any rental location belongs to the Aspire
  storefront.
