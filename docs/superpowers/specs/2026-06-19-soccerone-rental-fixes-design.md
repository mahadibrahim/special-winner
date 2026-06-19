# SoccerOne Rental Fixes Bundle — Design

**Date:** 2026-06-19
**Status:** Approved design → ready for implementation plan
**Author:** brainstormed with Mahad (after a real paid booking surfaced bugs)

## Summary
Four fixes/improvements to the SoccerOne field-rental flow, bundled because they share files (`FieldCalendar.tsx`, `availability.ts`, the bookings/My-Bookings code):

- **A** — My Bookings titles a rental by `Field ${fieldNumber}` but pins it by venue name → contradiction ("Field 1" vs "Field 2"). Title by venue name; light aesthetic pass on the rental card.
- **B** — **Timezone correctness.** The rent grid builds slot instants as UTC (`${date}T${hour}:00:00.000Z`), availability uses UTC day/window bounds, and My Bookings renders in the *browser's* timezone — so a "4 PM" selection is stored as `16:00Z` = **noon ET**, reserved at the wrong real time and displayed as 12:00 PM. Make "4 PM" mean 4 PM ET end-to-end.
- **C** — Unavailable slots show a generic dim "Unavailable". Surface the **reason** (Rented / Pickup Game / League Game / Closed / Reserved) with a bolder treatment.
- **D** — The existing paid booking is stored at the wrong time (noon). Add an **admin time-correction** to the rental detail and fix that booking.

## Root causes (confirmed)
- A: title = `Field ${r.fieldNumber}` (`src/lib/dashboard/normalize-bookings.ts:108`); pin = `venueName` (`src/components/dashboard/MyBookings.tsx`). In the one-venue-per-physical-field model, `venue.name` is the field identity; the internal `fieldNumber` is a redundant sub-index → they disagree.
- B: `FieldCalendar.tsx` slot construction uses `…Z` (UTC); `src/pages/api/rentals/availability.ts` + `src/lib/rentals/availability.ts` use UTC day bounds and apply `rentalOpenMinute/CloseMinute` to a UTC instant; `MyBookings.tsx` `fmtDateTime` uses `toLocaleString(undefined, …)` (browser tz). The rental **pricing** currently resolves in `"UTC"` — a band-aid that matched the broken grid.
- C: `src/lib/rentals/availability.ts` subtracts busy blocks and returns only free gaps; the block type from the `resource_blocks` ledger is discarded.

## Architecture

### B — Timezone correctness (the crux). Reuse existing tz primitives.
`src/lib/activity-tracking/tz-day.ts` already implements the Intl-based conversion (`computeTzOffsetMs`, `tzDayBoundsUtc`). `src/lib/time/business-timezone.ts` exports `BUSINESS_TIMEZONE = "America/New_York"`.
- **New shared helper** `zonedHourToUtc(date: string, hour: number, tz: string): Date` — return the UTC instant for `hour:00` local wall-clock on `date` in `tz` (using the same `computeTzOffsetMs` technique; ideally factor it so `tz-day.ts` and this share one offset function). Put it in `src/lib/time/` (e.g. extend `tz-day.ts` or a sibling).
- **FieldCalendar.tsx** — construct slot `startsAt` via `zonedHourToUtc(date, hour, orgTimeZone)` (replacing the `…Z` literal); `isHourBookable`/`getFreeBlockEnd` use the same conversion so hour↔free-block matching is in org tz. Grid labels stay `formatHour(hour)` (the grid hours ARE the local hours, now correct). `orgTimeZone` comes from a prop (passed by `rent.astro`, default `BUSINESS_TIMEZONE`).
- **Availability** (`availability.ts` API + `src/lib/rentals/availability.ts`) — compute the day bounds with `tzDayBoundsUtc(date, orgTimeZone)`, and the rental window from `rentalOpenMinute/CloseMinute` as **local** minutes-of-day converted via the zoned helper. Pass `orgTimeZone` into `getVenueRentalAvailability`.
- **Pricing** — revert the call sites (FieldCalendar live total + `bookings/index.ts`) from `"UTC"` back to `orgTimeZone`. Instants are now correct ET, so `quoteRentalCents(start, end, orgTimeZone)` resolves the right tier. Add a unit test: a correctly-constructed 4 PM ET summer weekday slot prices as the 3–6 PM tier ($170), a 7 PM slot as evening ($190).
- **My Bookings display** — `MyBookings.tsx` `fmtDateTime` formats with `{ timeZone: orgTimeZone }` (pass the org tz through `normalize-bookings`/props; default `BUSINESS_TIMEZONE`). Also the rent page's any server-rendered times.

### A — Title by venue name + card polish
- `normalize-bookings.ts` — for field rentals, set `title: venueName` (fallback `Field ${fieldNumber}` only if `venueName` is null). Title and pin now agree.
- Light aesthetic pass on the rental booking card in `MyBookings.tsx` (spacing/label consistency with the pickup card) — scoped, no redesign.

### C — Unavailable reasons + bolder
- **Availability** — also return the **busy** intervals with a `reason` label per field, derived from the `resource_blocks` block type. Mapping: field rental → "Rented"; drop-in session → "Pickup Game"; game → "League Game"; maintenance → "Closed"; external/partner → "Reserved"; unknown → "Unavailable". (Add a small `blockReasonLabel(kind)` helper near the ledger types; confirm the exact `resource_blocks` discriminator during impl.)
- **FieldCalendar** — for each non-bookable hour, find the covering busy interval and render its `reason` (instead of "Unavailable"), styled as a clear per-reason chip (bolder than the current dim text; lime/ink tokens; muted but legible). A helper maps hour → covering busy reason.

### D — Admin time-correction + fix the existing booking
- **Admin rental detail** (`src/pages/admin/rentals/[id].astro` + its editor component + `/api/admin/rentals/...`) — add a control to edit a booking's **start time + duration**, which re-runs conflict detection for the new slot and updates the `resource_blocks` ledger entry (reuse the existing hold/conflict + `syncRentalBlock` logic). Constrain to whole-hour, org-tz.
- **Fix the live booking** — after the feature ships, correct the one mis-timed paid booking to its intended time (4 PM ET) via the new admin control. (No refund needed — same midday-tier price.)

## Files touched
- New/extend: `src/lib/time/` (the `zonedHourToUtc` helper, sharing `computeTzOffsetMs`)
- Modify: `src/components/soccerone/FieldCalendar.tsx`, `src/pages/api/rentals/availability.ts`, `src/lib/rentals/availability.ts`, `src/pages/api/rentals/bookings/index.ts`, `src/components/dashboard/MyBookings.tsx`, `src/lib/dashboard/normalize-bookings.ts`, `src/pages/soccerone/rent.astro` (pass org tz)
- Admin (D): `src/pages/admin/rentals/[id].astro` + its editor + `src/pages/api/admin/rentals/[id].ts` (time-edit)
- Tests: extend `tests/unit/rentals/soccerone-pricing.test.ts` (org-tz tier after correct construction); a unit test for `zonedHourToUtc`; the e2e stays skip-guarded.

## Phasing
1. `zonedHourToUtc` helper + tests
2. Timezone correctness: FieldCalendar construction + availability (API + lib, with `tzDayBoundsUtc`) + pricing revert to org tz + unit tests
3. My Bookings: title by venue name (A) + org-tz time display (B) + card polish
4. Unavailable reasons + bolder (C): availability returns labeled busy blocks + FieldCalendar renders them
5. Admin time-correction (D) + correct the live booking

## Out of scope / follow-ups
- Admin-editable tiered rates (still deferred). Sub-hour booking granularity. Multi-timezone orgs (use `BUSINESS_TIMEZONE`; the org has a `timezone` column if needed later).

## Success criteria
- A grid "4 PM" slot books, stores, displays, and prices as **4 PM ET** everywhere (grid, My Bookings, ledger, Stripe). Verified across a tier (4 PM = $170 midday, 7 PM = $190 evening) and a tier-crossing multi-hour block.
- My Bookings shows the rental titled by its field (matches the pin) at the correct ET time.
- Unavailable slots show the reason (Rented / Pickup Game / League Game / Closed / Reserved), bolder.
- Admin can correct a booking's time; the existing mis-timed booking is fixed.
- Aspire flat-rate rentals unaffected; pricing unit tests pass.
