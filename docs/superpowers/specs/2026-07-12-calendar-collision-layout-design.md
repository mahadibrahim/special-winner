# Calendar Collision Layout — Mini Design Spec

- **Date:** 2026-07-12 (approved in conversation)
- **Problem:** overlapping same-space sessions render stacked on top of each other in the command-center day grid — illegible at busy venues, and back blocks intercept clicks aimed at front ones (root cause of the recurring activity-roster e2e flake).
- **Decision:** side-by-side (Google-Calendar style) lane layout.

## Design

- `src/lib/venue/calendar-layout.ts` gains a pure `assignLanes(blocks: {id, rowStart, rowEnd}[]): Map<string, {lane: number, laneCount: number}>`:
  - Sort by rowStart (then rowEnd desc for stability); greedy interval-graph coloring: each block takes the lowest lane free at its start row; laneCount for a block = max concurrent lanes across its own overlap cluster (connected component), so widths are consistent within a cluster.
  - Unit tests (tests/unit): no-overlap → all lane 0/count 1; simple pair; triple overlap; chain overlap (A∩B, B∩C, A∦C → all in one cluster, count 3 — wait, count = cluster max concurrency = 2 in a pure chain; assert THAT, not 3); the staging pile case (N identical intervals → lanes 0..N-1, count N).
- `ScheduleCalendar.tsx` (day view only): per space column, run assignLanes over that column's clamped blocks; render each block with `width: calc(100%/laneCount - 2px)`, `left: calc(100% * lane / laneCount)` inside the existing absolutely-positioned cell.
- `ActivityBlock` compact mode: also compact when laneCount ≥ 3 (narrow blocks show icon + time only); title always available via existing `title` tooltip and click→panel.
- Week view unchanged (list-stacked cells, no positioning — same rationale as the off-hours chip exclusion, comment already in WeekGrid.tsx).
- E2E: the existing activity-roster spec should pass reliably once blocks stop overlapping; add an assertion that two overlapping seeded sessions are BOTH clickable (click each, assert the panel title matches).

## Non-goals
Drag-to-reschedule; week-view lanes; changing the overlap data model (overlaps are legitimate — e.g. pickup alongside an ending rental).
