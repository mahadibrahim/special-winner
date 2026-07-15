# Division Day Planner — Design

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Branch:** `worktree-division-days`

## Problem

Parents browsing leagues can't tell which day a division plays. The card-rendering
half of this is already fixed (`feat(cards): surface the play day…`): cards now
render `seasons.dayOfWeek` when it's set. But `dayOfWeek` is **nullable and
frequently blank** — admins create divisions one at a time and rarely fill it in —
so the card fix only lights up where someone manually set a day.

The fix is to make day assignment a deliberate, capacity-aware planning step:
when an admin sets up a program's divisions, they should be able to lay all of
them out across the week at once and balance them across days for a venue, rather
than hand-entering a day per division with no view of the whole.

## Goals

- Give admins a **program-level planner** to assign each division (season) a
  **day of week**, balanced across days for a single venue.
- **Backfill** existing divisions that have no day, so the shipped card fix
  becomes visible on current data immediately.
- **Group divisions by day-of-week** on the public league pages (SoccerOne
  finder + Aspire adult soccer), so the day is the primary organizing dimension
  — matching how competitors (e.g. Stars Indoor Sports) distribute leagues:
  gender → day → level, with day as section headers.
- No schema change — reuse the existing `seasons.dayOfWeek` column.

## Non-goals (explicitly deferred — separate streams of work)

- **Time-of-day slots.** Days only. Start/end times stay untouched.
- **Field / `venue_resource` assignment.** Capacity is a soft, per-day guidance
  number, not a hard field-level constraint.
- **Game generation.** Actual games (with fields, times, and the
  `resource_blocks` collision engine) are generated after registration closes —
  a separate stream. This planner only sets the weekly day per division.

## Data model

**No schema change.** Everything writes to the existing
`seasons.dayOfWeek varchar(3)` (`'mon'..'sun'`). `startTime`/`endTime`/`venueId`
are read but not modified by the planner.

Capacity reference: `venues.fieldCount integer` gives the per-day soft capacity
shown in the UI (e.g. "3 divisions / 4 fields"). It is display guidance only —
the planner never blocks a save on it, because real collisions are resolved at
game generation.

## Component 1 — Backfill migration

A tracked, additive, idempotent Drizzle SQL migration (`db:generate` path, per
repo convention — never `db:push` to staging/prod):

```sql
-- Set dayOfWeek from the start-date weekday where it's currently unset.
UPDATE seasons
SET day_of_week = (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[
      EXTRACT(DOW FROM start_date)::int + 1]
WHERE day_of_week IS NULL
  AND start_date IS NOT NULL;
```

Idempotent by construction: the `WHERE day_of_week IS NULL` guard means re-running
is a no-op. Runs against prod via `migrate-prod.yml` on merge.

## Component 2 — Auto-balance (pure function)

`src/lib/scheduling/balance-days.ts` — no React, no DB, unit-testable.

```
balanceDays(divisions, openDays, opts) -> Map<divisionId, dayOfWeek>
```

- `divisions`: `{ id, dayOfWeek | null }[]` for one program + venue.
- `openDays`: the subset of `mon..sun` the admin has enabled for this venue.
- Behaviour: distributes divisions across `openDays` round-robin to keep per-day
  counts as even as possible.
- `opts.mode`:
  - `"fill-empty"` (default) — only assign divisions whose `dayOfWeek` is null;
    already-assigned divisions keep their day and count toward per-day load.
  - `"rebalance"` — ignore existing days and redistribute all divisions evenly.
- Deterministic ordering (by division id) so the same input always yields the
  same layout — important for testability and for the multi-tenant "explicit
  orderBy" hygiene rule.

## Component 3 — Batch update API

New tenant-scoped endpoint, e.g. `PATCH /api/admin/programs/[id]/division-days`.

- Auth/ownership: validate via the `requireSameOrg*` helpers in
  `src/lib/auth/require-resource-ownership.ts` — reject any season whose program
  is not in the resolved org (per the tenant-scoped-admin-endpoint rule).
- Body: `{ assignments: { seasonId: string, dayOfWeek: 'mon'..'sun' | null }[] }`.
- Validates every `seasonId` belongs to program `[id]` **and** the program
  belongs to the caller's org before writing.
- Updates all rows in a single transaction.
- Read side reuses the existing seasons query filtered by `programId` (+ the
  selected `venueId`); no new read endpoint needed if the planner page loads via
  the existing admin seasons data path.

## Component 4 — Planner UI

New admin view (route under `/admin`, reachable from the program/seasons admin
surface). Flow:

1. **Select a program**, then **select one of its venues** (one venue per
   session — divisions on other venues are out of scope for this session).
2. Load that program's divisions at that venue.
3. **Day board**: seven day columns (Mon–Sun). The admin toggles which days are
   "open" for this venue (default: all seven). Each division is a card placed in
   its day column, or in an "Unassigned" tray.
4. Cards can be moved between days (assign/reassign). An **Auto-balance** button
   runs `balanceDays` and lays the divisions out across the open days. A toggle
   chooses `fill-empty` vs `rebalance`.
5. Each day column header shows the soft capacity readout
   (`N divisions / fieldCount fields`), tinted when `N > fieldCount` — a warning,
   never a block.
6. **Save** posts the batch assignments; nothing persists before Save.

UI primitives: reuse `ErrorBanner` / `EmptyState` / `LoadingSkeleton` per the
repo's UI-feedback convention. The top-level `client:load` island calls
`useHydrationBeacon()` so any e2e spec can `waitForHydration`.

## Component 5 — Public day-grouped presentation

Make the day the primary organizing dimension on the two public league surfaces,
competitor-style. Both consume a single shared helper.

**Shared helper** — `groupDivisionsByDay()` in
`src/lib/leagues/division-filters.ts` (pure, no React). This lifts the grouping
that already lives inline in `season-tabs.tsx`'s `ScheduleTable` (lines ~100–117:
`WEEK_ORDER.map → filter per day → drop empty`) into a reusable, tested function:

```
groupDivisionsByDay(divisions) -> { day: DayKey, label: string, items: Division[] }[]
```

- Ordered by the canonical `WEEK_ORDER` (mon→sun).
- Days with no divisions are omitted.
- Divisions with `day == null` collapse into a trailing "Day TBD" group (rare
  after backfill + planner; still handled so nothing silently disappears).

**Surface A — SoccerOne finder** (`SoccerOneLeaguesFinder.tsx`). Today the finder
renders a flat card grid under filter chips. Change it to render **day-of-week
section headers** (Mon, Tue…) with each day's division cards beneath, using the
helper. Existing Location / Division / Level / Night filters still apply *before*
grouping; when the Night (day) filter is active the view naturally collapses to a
single section. The section header shows the day name and count.

**Surface B — Aspire adult soccer** (`/adult/leagues/soccer/[term]` →
`season-tabs.tsx`). The "divisions" tab currently shows a filtered list; regroup
it into the same day sections via the helper, and refactor `ScheduleTable` to
consume the extracted helper instead of its inline copy (no behaviour change to
the schedule tab).

Presentation only — no data or capacity changes. Divisions are still the existing
card/row components; only their grouping changes.

## Testing

- **Unit** (`tests/unit/`): `balanceDays` — even distribution across open days;
  `fill-empty` leaves assigned divisions untouched; `rebalance` redistributes;
  respects `openDays`; deterministic ordering; handles zero open days and zero
  divisions. Plus the DOW→slug mapping used by the backfill logic if it's lifted
  into TS.
- **API** (`tests/api/`): the batch endpoint — happy path writes all rows;
  **tenant isolation** (a `seasonId` from another org is rejected); a `seasonId`
  not in the target program is rejected; invalid `dayOfWeek` is rejected.
- **Migration**: verify idempotency (re-run is a no-op) and that already-set
  days are not overwritten.
- **Grouping helper** (`tests/unit/`): `groupDivisionsByDay` — `WEEK_ORDER`
  ordering; empty days omitted; `null`-day divisions land in the trailing "Day
  TBD" group; stable output.
- **E2E** (`tests/e2e/`): the SoccerOne finder and the Aspire adult term page
  render day-of-week section headers. These specs run **post-merge only**
  (`test-full`), so before merge, grep `tests/e2e/` for specs that assert on the
  SoccerOne finder / adult soccer layout and update them in the same PR (per the
  CLAUDE.md working-style note on post-merge specs).

## Out-of-scope reminders for the plan

Do **not** add `venueResourceId` to seasons, model time slots, or touch
`resource_blocks` / game generation in this work. Those are separate streams.
Component 5 is **presentation only** — no schema, capacity, or data changes.
