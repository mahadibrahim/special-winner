# Venue Front-Desk Command Center — Design Spec

- **Date:** 2026-06-20
- **Status:** Approved design (validated via interactive mockups); ready for implementation planning
- **Slice:** C of the "make the admin usable" effort — the venue-admin / front-desk operational experience. (Slice A = the offering wizard, shipped in PR #268.)

## Context

The venue manager (`location_admin`) and front-desk staff run a busy facility from a portal that is **scattered across ~6 separate pages** with no shared state:

- `/admin/venue/day/[date]` — a field-grouped schedule (polls every 15s)
- `/admin/venue/check-in` — a drawer-based check-in dashboard (polls every 5s, independent of the calendar)
- `/admin/venue/walk-up` — a multi-field walk-up registration form (records a payment *status* but does not collect payment)
- `/admin/venue/rosters` — read-only team rosters
- `/admin/announcements`, `/admin/refund-requests`, `/messages` — comms/requests

There is **no single "what's happening now" view**, no cross-event "needs attention" queue, the calendar and check-in screens don't reflect each other's updates, and there's no way to take a walk-in's payment at the desk.

## Problem

Front-desk staff can't **see the whole day at a glance** or **take the obvious next actions** without hopping between pages. Running a game day is slow and error-prone (a waiver gap or unassigned ref is invisible until you open the right drawer).

## Goals

- One responsive **command center** at `/admin/venue` that shows the day **live** and surfaces clear next actions.
- A **really visual calendar**: times down the left (half-hour rows), fields across the top, color+icon blocks, open slots, **Day/Week toggle**, prev/next, and hover/click → activity detail.
- An **activity roster view**: every rostered player with status (waiver / photo / paid / checked-in) and the **open slots**.
- A **walk-in → payment** flow the desk can run end to end.
- A **needs-attention queue** aggregating waivers · photos · refs · requests/messages with **inline actions**.
- **Reuse** existing data and action endpoints; no real-time infra rebuild, no payment hardware.

## Non-goals

- **Coach/team operational UI** (attendance, team comms) — a separate later slice.
- **Stripe Terminal / card-present hardware** and any card-present entry at the desk.
- **Cash/comp** as a primary walk-in payment path (the current walk-up form's status field stays; not a focus here).
- **Full schedule CRUD** — creating/editing sessions stays in super-admin / the Season Hub and the offering wizard. The command center calendar is read + light actions (existing "holds" remain).
- **SSE/WebSockets** — out of scope for v1 (see Real-time).

## Audience & context

Primary user: **venue admin + front-desk staff** (`location_admin` and their staff). Device: **responsive — desktop monitor at the desk, tablet at the desk, and phone on the floor** all supported.

## The interface

A responsive page at `/admin/venue` with three regions (desktop: Now strip on top, Schedule left ~63%, Needs-attention right ~37%; mobile: stacked **Now → Needs-attention → Calendar** so floor staff see actions before the schedule).

### 1. Now / Next live strip
Horizontally scrollable cards: each in-progress session per field (title, "X checked in / Y booked", a fill bar) and the next few upcoming sessions (with check-in-opens time, and early warnings like "⚠ no ref"). A "LIVE · updated Ns ago" indicator.

### 2. Schedule (the calendar)
- **Time × field grid:** time gutter on the left in **half-hour rows** (default 8 AM–9 PM, scrollable), **fields/spaces as columns**.
- **Blocks** colored + iconed by type (League ⚽ green, Tournament 🏆 purple, Drop-in 🎯 teal, Class 🏫 blue, Camp 🏕 orange, Rental 🔑 gray, Hold 🔧 slate), spanning their real duration, showing title + time + capacity, with at-a-glance warning chips (e.g. ⚠ NO REF).
- **Open slots** render as dashed "+ Open" cells.
- **Day / Week toggle** + **‹ Today ›** prev/next (advancing by day or by week depending on view).
- **Hover** shows a quick detail popover (counts, waivers, quick actions); **click** opens the full **activity roster panel** (§3).
- A legend of types.

### 3. Activity roster panel (click an activity)
- Header: type/field, title, time, walk-up rate, and a capacity summary (e.g. "9/20 booked · 2 checked in · 3 waivers out · 11 open").
- One row per rostered player: avatar, name, and **status chips — waiver ✓/out · photo ✓/none · paid ✓/unpaid · Here vs a Check-in button**. (These four chips are the confirmed set.)
- **Open slots** listed as dashed "+ add walk-in" rows, with a "+ N more open slots" tail.

### 4. Walk-in → registration → payment
Triggered from an open slot (or a top-level "Walk-in" action):
1. **Who's playing** — Adult/Child toggle, name, mobile and/or email.
2. **Waiver** — sign on this device, **or send a link by email or SMS**.
3. **Payment** — show amount due (walk-up rate). Two supported methods:
   - **Send a pay link (email or SMS)** — customer pays on their own phone; the slot holds until paid. Reuses the existing payment-link infra.
   - **Self-pay on a kiosk tablet** — hand off to the existing kiosk walk-in flow (Stripe PaymentElement) shipped in this codebase.
4. **On success:** the person is added to the roster, marked **paid**, and **checked in**.

### 5. Needs-attention queue
Aggregated, grouped, with a total badge and inline actions:
- **Waivers outstanding** — people on today's sessions without a signed waiver → **Send link** (email/SMS/QR).
- **Missing check-in photos** — checked-in people without a photo → **Capture**.
- **Unassigned referees** — today's games/tournaments with no ref → **Assign** (flag; resolution may link out).
- **Requests & messages** — pending refund requests → **Review**; unread inbox → **Open**.
Each group shows a live count; long groups collapse behind "See all N ›".

## Real-time

A **single aggregation endpoint** (e.g. `GET /api/admin/venue/today?locationId=&date=`) returns everything the screen needs in one payload: the day's sessions/blocks per field, per-session booked/checked-in/waiver/photo counts, the now/next derivation, and the needs-attention items. The page polls it on **one shared interval (~5–10s)**, pausing when the tab is hidden (the existing venue-day hook already does visibility-aware polling — reuse that pattern). This replaces today's two independent, unsynced polls so counts and the calendar always agree. **SSE/WebSockets are a documented future enhancement** if poll latency proves annoying; not built in v1.

## Reuse & data

- **Aggregation endpoint** composes existing sources: `seasons`/sessions, drop-in bookings, field rentals, check-ins, waiver status, ref assignments, refund-requests, and inbox unread counts — scoped to the manager's location(s) via the existing `getEffectiveLocationIds` helper.
- **Action endpoints reused as-is:** check-in (`/api/admin/check-in/*`), send-link (email/SMS/QR from the check-in drawer), the kiosk walk-in start/payment endpoints, and the payment-link flow.
- **Calendar** builds on the existing `venue-day` data hook + activity model (extend, don't replace).

## Components (decomposition)

- `VenueCommandCenter` (page shell + shared poll/state) → composes `NowStrip`, `ScheduleCalendar`, `NeedsAttentionQueue`.
- `ScheduleCalendar` (time×field grid; Day/Week; prev/next) → `ActivityBlock`, `OpenSlot`, `ActivityDetailPanel`.
- `ActivityDetailPanel` (roster rows + open slots) → `RosterRow` (status chips + check-in), `WalkInFlow`.
- `WalkInFlow` (who → waiver → payment) reusing send-link + payment-link + kiosk hand-off.
- `NeedsAttentionQueue` → `AttentionGroup` (waivers/photos/refs/requests) with inline action buttons.
- One aggregation endpoint + a `useVenueToday` shared-poll hook.

Each unit has one responsibility and a clear prop interface; the aggregation endpoint is the single data contract the whole screen reads.

## Error / loading / empty

- Use the shared `ErrorBanner` / `LoadingSkeleton` / `EmptyState` primitives (per CLAUDE.md).
- Stale-data tolerance: keep showing the last good payload with the "updated Ns ago" stamp if a poll fails; surface a quiet retry, not a blocking error.
- Empty day → a friendly "Nothing scheduled today" state with quick actions (walk-in, new offering).

## Testing

- **Unit:** the now/next derivation and the needs-attention aggregation/grouping (pure functions over a sample payload); the walk-in payload mapper.
- **API:** the aggregation endpoint returns correctly location-scoped data and counts; tenant scoping enforced.
- **E2E (Playwright):** open the command center, click an activity → see roster + open slots; run a walk-in via "send pay link"; verify a check-in updates the now-strip count. Use the repo's `waitForHydration` conventions.

## Rollout

- Ship the aggregation endpoint first (additive), then the command-center page behind the existing `/admin/venue` route (the current redirect-to-calendar is replaced; the calendar lives on inside the new page).
- The old check-in / walk-up pages remain reachable during transition, then become deep-links from the command center.
- No schema changes anticipated; if ref-assignment or photo-status needs a new read path, add it additively.
