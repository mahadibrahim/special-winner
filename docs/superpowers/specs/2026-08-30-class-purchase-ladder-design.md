# Class purchase ladder — packs, blocks, drop-ins

**Date:** 2026-08-30
**Status:** Approved design, pending implementation plan
**Owner decisions captured from:** brainstorming session 2026-08-30

## Context

The youth classes engine (PRs #586 billing, #589 engine, #590 UX) supports exactly one
purchase arrangement: a recurring monthly Stripe subscription per child, granting a
calendar-month allotment of N classes (or unlimited). Competitors typically contract
scheduling/commerce out to third-party services (Mindbody et al.); we are building it
in-house. Parents need more ways in, and the `/youth/classes` marketing copy already
promises "multi-week blocks" that the engine cannot sell — a shipped contradiction.

This is Project 1 of a four-project program (Project 2: self-serve booking management;
Project 3: calendar & reminders / PWA groundwork; Project 4: camps live data). Classes
start ~2026-09-13; this project is the revenue door and goes first.

## Goal

Sell the full commitment ladder, in-house, without parallel subsystems:

| Rung | What the parent buys | Engine concept |
|------|----------------------|----------------|
| Drop-in | One session, no commitment | Direct payment (existing paid path, made public) |
| Pack | N floating session credits for one child | Credit grant, source `pack` |
| Block | The remaining weeks of a defined block in one weekly slot | Credit grant, source `block`, pinned to slot + enrollment |
| Membership | Recurring monthly allotment / unlimited | Existing engine, untouched |

One ledger, four doors. "Not overly complex" is an explicit owner constraint.

## Owner decisions (locked)

1. **All four rungs supported** — drop-in, pack, block, membership.
2. **Pack credits are per-child**, not family-shared.
3. **Blocks are admin-defined calendar windows** (org-wide dates). Families may join
   mid-block; fees prorate by remaining sessions.
4. **PWA is groundwork-later** — nothing in this project may block a future PWA, but no
   PWA work happens here (Project 3 handles calendar/reminder groundwork).

## Schema

Three additions; the membership engine is not modified.

### `class_pack_products` (new table)

Admin-defined pack catalog, mirroring the `membership_tiers` pattern:

- `id`, `organizationId`, `name`, `sessionCount` (int), `priceCents`,
  `expiryMonths` (int, credits expire this many months after purchase),
  `active`, `displayOrder`, `createdAt`/`updatedAt`
- `stripeProductId`, `stripePriceId` (one-time price) — created/reconciled by the admin
  CRUD the way `admin-stripe.ts` / `tier-price-diff.ts` do for tiers.

### `class_blocks` (new table)

Admin-defined org-wide block windows:

- `id`, `organizationId`, `name` (e.g. "Fall Block"), `startDate`, `endDate` (dates in
  org timezone semantics, stored as dates), `active`, `createdAt`/`updatedAt`
- One set of dates shared by all weekly slot templates. Per-class block pricing comes
  from the template (below), not the block row.

### `class_slot_templates.blockRateCents` (new column)

Per-session rate used when purchasing a block of this template. Null → falls back to
`sessionRateCents`. (Display: full-block price = occurrences-in-window × rate;
mid-block price = remaining occurrences × rate.)

### `class_credit_grants` (new table)

The per-child credits ledger:

- `id`, `organizationId`, `familyMemberId`, `source` enum (`pack` | `block`)
- `packProductId` (nullable FK), `blockId` (nullable FK),
  `slotTemplateId` (nullable FK — set for block grants; pins the credits)
- `sessionsGranted` (int), `pricePaidCents`, `expiresAt`
  (pack: purchase time + `expiryMonths`; block: block `endDate`)
- `stripeCheckoutSessionId` (idempotency + audit), `createdAt`

**Balance is count-derived, never stored.** Remaining = `sessionsGranted` − count of
non-cancelled bookings referencing the grant. Same derive-don't-store pattern as the
monthly allotment (`allotment.ts`), same accepted TOCTOU tolerance.

### `drop_in_bookings` changes

- `paymentMethod` enum gains `pack_credit`. **Enum addition ships as its own migration,
  committed before any migration that uses the value** (Postgres 55P04 lesson).
- New nullable `creditGrantId` FK column — attribution for balance derivation and for
  freeing the credit on cancel.

## Purchase flows

All flows require sign-in (children + waivers make guest checkout a non-starter here);
unauthenticated users bounce through `/signin?redirect=…` exactly like the tier join
flow. All reuse the existing ChildPicker and the existing waiver-required (422)
handshake at first booking.

### Pack

1. `POST /api/classes/packs/purchase` `{ packProductId, familyMemberId }`
2. Server validates org scope, child ownership, product active; creates Stripe Checkout
   Session in **payment** mode with the pack's one-time price. Metadata carries
   `familyMemberId` + `packProductId`.
3. `checkout.session.completed` webhook inserts the `class_credit_grants` row (grant is
   webhook-written only — no orphan grants, mirroring the memberships pattern).
   Idempotent on `stripeCheckoutSessionId`.
4. Success URL → dashboard family card with the new balance visible and a "book a
   session" CTA.

### Block

1. Public UX: pick the block (current-or-next active window) → pick a weekly slot
   (reuses the choose-slot slot list with capacity display) → child picker.
2. `POST /api/classes/blocks/purchase` `{ blockId, slotTemplateId, familyMemberId }`
3. Server computes **remaining occurrences**: weekday-math over the block window,
   counting occurrences strictly after now (org-timezone wall-clock, DST-safe — reuse
   the materializer's wall-time conversion helpers). Price = occurrences ×
   `blockRateCents` (fallback `sessionRateCents`). Capacity check: active enrollments
   on the template < capacity, else 409.
4. Stripe Checkout in payment mode with a dynamic `price_data` amount; metadata carries
   block/slot/child.
5. Webhook (idempotent): insert pinned credit grant + insert `class_enrollments` row
   (`status: active`, ends at block end — reusing the enrollment the auto-booking cron
   already understands) + immediately book any already-materialized upcoming sessions
   of that slot against the grant.
6. The daily materialize/auto-book cron books each week's session for block enrollments
   by consuming pinned credits (`paymentMethod: pack_credit`, `creditGrantId` set)
   instead of a membership allotment. When the grant is exhausted or expired, the cron
   skips (existing `skippedExhausted` counter path) — no charge, no booking.
7. Block end: enrollment ends (either `endedAt` reached or grant exhausted); template
   capacity frees. (Renewal nudges are Project 3 material.)

### Drop-in

1. The public class schedule (`class-schedule.tsx`) gains a "book this session" door
   for non-members: pick session → sign-in → child picker → waiver if needed.
2. Reuses the existing paid path (`POST /api/dropin/bookings` with `familyMemberId`) at
   the session's `sessionRateCents`. Today that path is only reachable as a member
   make-up fallback; this makes it a first-class public entry.
3. **Bug fixed in passing:** when a template has null rates the paid path currently
   falls back to the *adult pickup* rate card. Class-kind sessions must never fall
   back to the adult card; treat missing class rates as a config error surfaced in
   admin, not a silent adult price.

### Redemption order (booking any class session for a child)

membership unlimited → membership allotment → **pinned block credits** (only for that
slot's sessions, unexpired) → **floating pack credits** (any class session, unexpired,
oldest-expiry first) → offer paid checkout.

Cancelling a credit-paid booking within the cancel window frees the credit (`creditFreed`
mechanics already exist); credit bookings never refund as cash.

## Public UX

- **`/youth/classes` pricing band** becomes the four-rung ladder (replacing the current
  tiers-only `ClassTiers` band): drop-in (from-price), packs (catalog cards), block
  (current/next window dates, full price, "join mid-block — pay only for the weeks
  left" note), membership (existing tier cards). Each rung's CTA enters its flow from
  the section. Emerald youth palette, band grammar per `docs/design-system.md`; no
  eyebrow text; fail-soft to the existing figure-free fallback cards when catalog data
  is empty.
- **Copy fix:** the block copy in the FAQ/band becomes true; remove the
  monthly-vs-block contradiction.
- **Dashboard `family-classes-card`**: gains a credits line per child — remaining
  sessions, source, expiry date — and a "use a credit" path into the existing make-up
  booking modal (which now redeems credits per the order above before offering paid).
- **Trial flow untouched.**

## Admin UX

`/admin/classes` gains two tabs alongside templates:

- **Packs** — CRUD on `class_pack_products` with Stripe product/price reconciliation on
  create/update (deactivate rather than delete once purchased; hard-delete iff
  unreferenced, mirroring tier delete semantics).
- **Blocks** — CRUD on `class_blocks` (name, dates, active). Validation: no
  overlapping active windows.
- **Template form** gains `blockRateCents`.
- Tenant scoping via `requireSameOrg*` helpers on every new admin endpoint, per repo
  rule.

## Out of scope (deliberate)

- Family-shared credits (owner chose per-child).
- Reschedule/move booking, parent cancel/pause of child membership, admin session-level
  overrides (holiday cancels affect block proration only via Project 2's skip-dates —
  until then, proration counts plain weekday occurrences).
- Calendar feeds, reminders, add-to-calendar, PWA (Project 3).
- Camps (#572/#573 — Project 4), sport-scoped classes URLs (#564 — deferred).
- Cash refunds for packs/blocks (admin handles via Stripe dashboard).
- Waitlists at the enrollment/block layer.
- #565 is absorbed: per-session class pricing surfaces via template rates + this ladder;
  no separate rate-card build.

## Testing

- **Unit:** block proration math (occurrence counting across DST, mid-block joins,
  boundary days); redemption-order resolution; expiry filtering; balance derivation.
- **API:** pack purchase → webhook → grant → book with credit; block purchase →
  webhook → enrollment + immediate bookings; drop-in public door; redemption order
  end-to-end incl. 402 → paid fallback; idempotent webhook replay; org-scope + child-
  ownership rejections. (Stripe-dependent fixtures gated `itWithStripe` per CI
  convention.)
- **E2E (Playwright):** buy a pack → book a session with the credit → see balance
  decrement on the family card. Hydration-beacon + `waitForHydration` per convention.
- **Post-merge sweep:** grep `tests/e2e/` for specs touching `/youth/classes` and the
  family dashboard card; update in the same PR (test-full runs post-merge only).

## Execution model

Fable (this session) plans and orchestrates; implementation is subagent-driven:
Opus subagents for engine/Stripe/webhook/migration tasks, Sonnet subagents for UI and
mechanical tasks. Work proceeds on `classes-purchase-ladder` in this worktree; enum
migration lands as its own commit; every subagent dispatch pins absolute worktree paths
(subagents otherwise drift to the main checkout). CI green on origin gates completion.
