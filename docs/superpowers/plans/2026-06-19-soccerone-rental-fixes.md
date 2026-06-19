# SoccerOne Rental Fixes Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SoccerOne field rentals timezone-correct end-to-end (a "4 PM" slot means 4 PM ET everywhere), fix the My-Bookings field label, show *why* a slot is unavailable, and add an admin time-correction.

**Architecture:** Reuse the existing Intl tz primitives in `src/lib/activity-tracking/tz-day.ts` (`computeTzOffsetMs`, `tzDayBoundsUtc`) — add a `zonedHourToUtc` helper there. The rent grid constructs slots in org tz, availability computes bounds in org tz, pricing resolves in org tz (reverting the `"UTC"` band-aid), and My Bookings renders in org tz. Availability also returns labeled busy blocks for the "reason" UI.

**Tech Stack:** Astro 5 SSR, React 19 islands, Drizzle, Vitest, Playwright. `BUSINESS_TIMEZONE = "America/New_York"` (`src/lib/time/business-timezone.ts`). Money in cents; times in UTC, displayed/constructed via org tz.

**Spec:** `docs/superpowers/specs/2026-06-19-soccerone-rental-fixes-design.md` — read it first.

**Phase map (implement in order):**
- **P1** — `zonedHourToUtc` helper + tests
- **P2** — Timezone correctness (FieldCalendar construction + availability + pricing revert) + tests
- **P3** — My Bookings: title by venue name (A) + org-tz time display + card polish
- **P4** — Unavailable reasons + bolder (C)
- **P5** — Admin time-correction (D) + correct the live booking

**Conventions:** work in this worktree (`feat/soccerone-rental-tz-fixes`). Unit tests: `npm run test:unit -- <file>`. Org timezone source: `Astro.locals.organization?.timezone ?? BUSINESS_TIMEZONE`. New island CSS goes in the island's embedded `<style>`. Whole-hour rentals.

---

## Phase 1 — `zonedHourToUtc` helper

### Task 1.1: Add `zonedHourToUtc` (reuse the tz-day offset technique)

**Files:**
- Modify: `src/lib/activity-tracking/tz-day.ts` (add export; reuse the existing private `computeTzOffsetMs`)
- Test: `tests/unit/time/zoned-hour-to-utc.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/time/zoned-hour-to-utc.test.ts
import { describe, it, expect } from "vitest"
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day"

const TZ = "America/New_York"

describe("zonedHourToUtc", () => {
  it("summer EDT (UTC-4): 4 PM ET on 2026-07-15 = 20:00Z", () => {
    expect(zonedHourToUtc("2026-07-15", 16, TZ).toISOString()).toBe("2026-07-15T20:00:00.000Z")
  })
  it("summer EDT: 7 PM ET = 23:00Z", () => {
    expect(zonedHourToUtc("2026-07-15", 19, TZ).toISOString()).toBe("2026-07-15T23:00:00.000Z")
  })
  it("winter EST (UTC-5): 4 PM ET on 2026-01-14 = 21:00Z", () => {
    expect(zonedHourToUtc("2026-01-14", 16, TZ).toISOString()).toBe("2026-01-14T21:00:00.000Z")
  })
  it("midnight: hour 0 ET maps to the local-day start", () => {
    // 2026-07-15 00:00 ET = 04:00Z (EDT)
    expect(zonedHourToUtc("2026-07-15", 0, TZ).toISOString()).toBe("2026-07-15T04:00:00.000Z")
  })
})
```

- [ ] **Step 2: Run, confirm FAIL** — `npm run test:unit -- tests/unit/time/zoned-hour-to-utc.test.ts` (export missing).

- [ ] **Step 3: Implement.** In `tz-day.ts`, the file already has `computeTzOffsetMs(at, tz)` (private) returning `localWallClock - utc`, and `tzDayBoundsUtc`. Add (exported), reusing `computeTzOffsetMs`:

```ts
/**
 * UTC instant for `hour:00` local wall-clock on `date` (YYYY-MM-DD) in `tz`.
 * Inverse of resolving a UTC instant's local hour. Whole-hour only.
 */
export function zonedHourToUtc(date: string, hour: number, tz: string): Date {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error(`zonedHourToUtc: invalid date '${date}', expected YYYY-MM-DD`)
  const [, y, mo, d] = m
  // Wall-clock as-if-UTC, then subtract the tz offset at that instant.
  const asUtc = new Date(`${y}-${mo}-${d}T${String(hour).padStart(2, "0")}:00:00.000Z`)
  return new Date(asUtc.getTime() - computeTzOffsetMs(asUtc, tz))
}
```

- [ ] **Step 4: Run, confirm PASS** (4 tests). **Step 5: `npx tsc --noEmit` → 0. Step 6: commit**

```bash
git add src/lib/activity-tracking/tz-day.ts tests/unit/time/zoned-hour-to-utc.test.ts
git commit -m "feat(time): zonedHourToUtc — local wall-clock hour to UTC"
```

---

## Phase 2 — Timezone correctness

### Task 2.1: Pricing reverts to org tz (engine call sites)

**Files:** Modify `src/components/soccerone/FieldCalendar.tsx`, `src/pages/api/rentals/bookings/index.ts`; Test: extend `tests/unit/rentals/soccerone-pricing.test.ts`.

- [ ] **Step 1: Add a test** documenting that correctly-constructed ET instants price by the ET tier:

```ts
// append to tests/unit/rentals/soccerone-pricing.test.ts
it("ET-correct instants price by the local tier (4pm ET summer = midday $170, 7pm = evening $190)", () => {
  // 4 PM EDT = 20:00Z; 5 PM EDT = 21:00Z (1h booking)
  expect(quoteRentalCents(utc("2026-07-15T20:00:00Z"), utc("2026-07-15T21:00:00Z"), "America/New_York")).toBe(17000)
  // 7 PM EDT = 23:00Z; 8 PM = 00:00Z+1
  expect(quoteRentalCents(utc("2026-07-15T23:00:00Z"), utc("2026-07-16T00:00:00Z"), "America/New_York")).toBe(19000)
})
```
Run it: passes already (engine is generic). This pins the org-tz behavior we're reverting to.

- [ ] **Step 2: FieldCalendar** — change the live-total call from `quoteRentalCents(startsAt, endsAt, "UTC")` to `quoteRentalCents(startsAt, endsAt, orgTimeZone)`. Re-add an `orgTimeZone` prop (string, default `"America/New_York"`) to the component (it was removed in the band-aid; rent.astro will pass it in Task 2.3). Update the comment to: `// Price in the org timezone (slots are constructed in org tz — see zonedHourToUtc).`

- [ ] **Step 3: bookings API** — change the SoccerOne branch from `quoteRentalCents(startsAt, endsAt, "UTC")` to `quoteRentalCents(startsAt, endsAt, locals.organization?.timezone ?? "America/New_York")`. Keep the `locals.brandId === "soccerone"` gate + the `else` flat path.

- [ ] **Step 4:** `npx tsc --noEmit` → 0. **Step 5: commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx src/pages/api/rentals/bookings/index.ts tests/unit/rentals/soccerone-pricing.test.ts
git commit -m "fix(rentals): price in org timezone (revert UTC band-aid)"
```

### Task 2.2: FieldCalendar constructs slots in org tz

**Files:** Modify `src/components/soccerone/FieldCalendar.tsx`. Read it first (slot construction in `handleBook`, and `isHourBookable`/`getFreeBlockEnd` which build `${dateStr}T${hour}:00:00.000Z`).

- [ ] **Step 1:** Import `zonedHourToUtc` from `@/lib/activity-tracking/tz-day`. Replace EVERY `new Date(\`${date}T${hour}:00:00.000Z\`)`-style construction (in `handleBook`, `isHourBookable`, `getFreeBlockEnd`) with `zonedHourToUtc(dateStr, h, orgTimeZone)`. `endsAt = new Date(startsAt.getTime() + durationMinutes*60000)` stays (duration in ms is tz-agnostic). The grid `HOURS` (16–23) and `formatHour(hour)` labels stay — they're the local hours, now correctly mapped.
- [ ] **Step 2:** Ensure the availability free-block matching still works: `isHourBookable`/`getFreeBlockEnd` compare the zoned `hourStart`/`hourEnd` (now correct UTC) against the free blocks returned by the availability API (which Task 2.3 makes org-tz-correct). No further change beyond using `zonedHourToUtc`.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npm run build` → island bundles. **Step 4: commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx
git commit -m "fix(soccerone): construct rental slots in org timezone"
```

### Task 2.3: Availability computes bounds in org tz + rent.astro passes org tz

**Files:** Modify `src/pages/api/rentals/availability.ts`, `src/lib/rentals/availability.ts`, `src/pages/soccerone/rent.astro`. Read all three first.

- [ ] **Step 1: availability API** (`src/pages/api/rentals/availability.ts`) — replace the UTC day bounds (`new Date(\`${date}T00:00:00.000Z\`)`) with `tzDayBoundsUtc(date, orgTimeZone)` from `@/lib/activity-tracking/tz-day`, where `orgTimeZone = locals.organization?.timezone ?? "America/New_York"`. Pass `orgTimeZone` into `getVenueRentalAvailability(...)`.
- [ ] **Step 2: availability lib** (`src/lib/rentals/availability.ts`) — accept `timeZone` param; compute the rental window from `rentalOpenMinute`/`rentalCloseMinute` (minutes of LOCAL day) against the local day start: `windowStart = zonedMinuteToUtc(date, rentalOpenMinute, tz)`. Since the helper is hour-based, derive the window from the local day start: `dayStartLocalUtc = tzDayBoundsUtc(date, tz).startUtc`, then `windowStart = new Date(dayStartLocalUtc.getTime() + rentalOpenMinute*60000)` and `windowEnd = dayStartLocalUtc + rentalCloseMinute*60000`. (Local-day start in UTC + local-minute offset = the correct UTC window edge, since the offset is within the same day with no DST change in the 4pm–midnight window.) Use the bounds for the free-block subtraction as before.
- [ ] **Step 3: rent.astro** — compute `const orgTimeZone = Astro.locals.organization?.timezone ?? "America/New_York"` and pass `timeZone={orgTimeZone}` to `<FieldCalendar>` (alongside the existing `memberDiscountPct`). Confirm FieldCalendar uses it for both slot construction (2.2) and the availability fetch + pricing (2.1).
- [ ] **Step 4:** `npx tsc --noEmit` → 0; `npm run build` → no rentals/rent error. **Step 5: commit**

```bash
git add src/pages/api/rentals/availability.ts src/lib/rentals/availability.ts src/pages/soccerone/rent.astro
git commit -m "fix(rentals): compute availability + rental window in org timezone"
```

---

## Phase 3 — My Bookings: field label + org-tz display + polish

### Task 3.1: Title rentals by venue name + render in org tz

**Files:** Modify `src/lib/dashboard/normalize-bookings.ts` (line ~108), `src/components/dashboard/MyBookings.tsx` (the `fmtDateTime` helper + how org tz reaches it).

- [ ] **Step 1:** Read both. In `normalize-bookings.ts`, the field-rental mapping sets `title: \`Field ${r.fieldNumber}\``. Change to `title: r.venueName ?? \`Field ${r.fieldNumber}\``. Carry the org timezone through the normalized booking (add a field, or pass it to the component) so the display can format in org tz — simplest: have `normalize-bookings` include `timeZone` (from the org) on each booking, or pass an org-tz prop to `<MyBookings>`. Pick the lighter path consistent with how the page provides data.
- [ ] **Step 2: MyBookings** `fmtDateTime(iso)` currently uses `toLocaleString(undefined, …)` (browser tz). Change to accept/use the org tz: `toLocaleString("en-US", { timeZone, weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })` where `timeZone` comes from the booking/prop (default `"America/New_York"`).
- [ ] **Step 3:** `npx tsc --noEmit` → 0. **Step 4: commit**

```bash
git add src/lib/dashboard/normalize-bookings.ts src/components/dashboard/MyBookings.tsx
git commit -m "fix(dashboard): rentals titled by venue name + shown in org timezone"
```

### Task 3.2: Light aesthetic pass on the rental booking card

**Files:** Modify `src/components/dashboard/MyBookings.tsx` (rental card only).

- [ ] **Step 1:** Read the rental card vs the pickup card. Make the rental card visually consistent (spacing, label/badge alignment, the CONFIRMED chip, the icon tile) with the pickup card — scoped polish, no redesign. Keep all data/handlers.
- [ ] **Step 2:** `npm run build` → clean. **Step 3: commit**

```bash
git add src/components/dashboard/MyBookings.tsx
git commit -m "polish(dashboard): tidy the rental booking card"
```

---

## Phase 4 — Unavailable reasons + bolder

### Task 4.1: Availability returns labeled busy blocks

**Files:** Modify `src/lib/rentals/availability.ts` (+ the API response in `src/pages/api/rentals/availability.ts`); read the `resource_blocks` ledger schema (`src/lib/db/schema/scheduling.ts`) to find the block-type/source discriminator.

- [ ] **Step 1:** Find the `resource_blocks` discriminator (e.g. a `kind`/`source`/`blockType` column distinguishing game / drop-in / rental / maintenance / external). Add a pure helper `blockReasonLabel(kind: string): string` (in the availability lib or near the ledger types): rental → "Rented", drop-in/pickup → "Pickup Game", game → "League Game", maintenance → "Closed", external → "Reserved", default → "Unavailable". Unit-test it with each kind.
- [ ] **Step 2:** Extend `getVenueRentalAvailability` to also return, per field, the **busy** intervals with `{ startsAt, endsAt, reason }` (reason via `blockReasonLabel`), alongside the existing `free` blocks. Update the API response type + the `AvailabilityResponse` interface consumed by FieldCalendar.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; run the new helper unit test. **Step 4: commit**

```bash
git add src/lib/rentals/availability.ts src/pages/api/rentals/availability.ts tests/unit/rentals/block-reason.test.ts
git commit -m "feat(rentals): availability returns busy blocks with a reason label"
```

### Task 4.2: FieldCalendar renders the reason + bolder

**Files:** Modify `src/components/soccerone/FieldCalendar.tsx` (CSS in its embedded `<style>`).

- [ ] **Step 1:** Consume the new `busy` intervals. For each non-bookable hour, find the covering busy interval (using `zonedHourToUtc(dateStr, h, orgTimeZone)` to match) and render its `reason` text instead of "Unavailable". If no reason found (edge), fall back to "Unavailable".
- [ ] **Step 2:** Style the reason as a clear per-reason chip (bolder than the current dim grey): a small uppercase mono/label chip in the slot row, legible but visually distinct from "Available — click to select". Add the CSS to the island's embedded `<style>`. Keep it monochrome-lime/ink.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npm run build` → island bundles. **Step 4: commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx
git commit -m "feat(soccerone): unavailable rental slots show the reason (bolder)"
```

---

## Phase 5 — Admin time-correction + fix the live booking

### Task 5.1: Admin can edit a rental booking's time

**Files:** Modify the admin rental detail (`src/pages/admin/rentals/[id].astro` + its editor component, likely `src/components/admin/rentals/RentalDetail.tsx`) and the admin API (`src/pages/api/admin/rentals/[id].ts` or similar). Read all first.

- [ ] **Step 1:** Add a PUT/PATCH path (or extend the existing one) that edits a rental's `startsAt`/`endsAt` (whole-hour, org tz). It MUST re-run the existing conflict check for the new slot (reuse `assertNoRentalConflict`/the hold logic) and update the `resource_blocks` ledger entry (reuse `syncRentalBlock`). Reject on conflict (409). Do NOT change payment.
- [ ] **Step 2:** Add a minimal admin UI control (date + start-hour + duration) on the rental detail to call it, with success/error feedback. Match the admin's existing component style.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npm run build` → clean. **Step 4: commit**

```bash
git add src/pages/admin/rentals/[id].astro src/components/admin/rentals/RentalDetail.tsx src/pages/api/admin/rentals/[id].ts
git commit -m "feat(admin): correct a field rental's time (conflict-checked, re-syncs ledger)"
```

### Task 5.2: Correct the existing mis-timed booking (post-deploy, manual)

- [ ] After this ships to prod, use the new admin time-correction to move the one mis-timed paid booking to its intended **4 PM ET**. (No refund — same midday tier.) This is an operational step, not code; note it in the PR description.

---

## Out of scope / follow-ups
- Admin-editable tiered rates (deferred); sub-hour granularity; multi-timezone orgs.

## Self-review notes
- **Spec coverage:** B → P1+P2 (helper, construction, availability, pricing revert, display in P3); A → P3.1; card polish → P3.2; C → P4; D → P5.
- **Testing strategy:** `zonedHourToUtc` + `blockReasonLabel` + pricing-org-tz are unit-tested; FieldCalendar/availability/admin verified via tsc + build + manual/prod (SoccerOne e2e is post-merge only).
- **Type consistency:** `zonedHourToUtc(date, hour, tz)`, `tzDayBoundsUtc(date, tz)`, the `timeZone`/`orgTimeZone` prop on FieldCalendar, the `busy: {startsAt,endsAt,reason}[]` availability shape, and `blockReasonLabel(kind)` are defined in P1/P2/P4 and reused consistently.
- **Pre-existing-behavior caution:** the UTC-grid convention was pre-existing; P2 corrects it for SoccerOne rentals. Confirm Aspire/other rental consumers (if any) still work — the availability change is org-tz for all, which is the correct behavior (Aspire is also Eastern); the pricing change is SoccerOne-gated.
