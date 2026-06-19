# SoccerOne Field Rental Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge SoccerOne field rentals at the real seasonal/time-tiered per-hour rates with multi-hour booking, tier-specific member discounts, the availability disclaimer, and a 14-day cancellation policy — reusing the existing rentals/Stripe infrastructure.

**Architecture:** A new pure pricing engine (`soccerone-pricing.ts`) resolves each hour's rate by season × day-type × time-tier (in the org timezone) and sums per hour; it's shared by the booking API (authoritative charge) and `FieldCalendar` (live total). The engine is applied for the SoccerOne org only; Aspire keeps its flat rate path. Member discounts ride the existing per-tier `rental_discount_pct` mechanism.

**Tech Stack:** Astro 5 SSR, React 19 islands, Drizzle, Stripe, Vitest (`tests/unit`), Playwright. `--so-*` tokens for SoccerOne styling. Money in integer cents.

**Spec:** `docs/superpowers/specs/2026-06-19-soccerone-rental-revamp-design.md` — read it first.

**Phase map (implement in order; each phase is a reviewable chunk):**
- **P1** — Pure tiered pricing engine + tests
- **P2** — Wire the engine into the booking API (SoccerOne-gated) + set `cancelWindowHours`
- **P3** — `FieldCalendar` multi-hour + live member-aware total
- **P4** — `rent.astro` tiered rates table + disclaimer + cancellation copy + member prop
- **P5** — Package-request form (reuse corporate-inquiry infra)
- **P6** — Member tier-benefit config (Founder 25 / others 10) — data step
- **P7** — Pickup jump-link overshoot fix (carry-over)

**Conventions:** work in this worktree (`feat/soccerone-rental-revamp`). Unit tests: `npm run test:unit -- <file>`. Keep SoccerOne pages `prerender = false`. New island CSS goes in the island's embedded `<style>` (Astro scoped styles don't reach island DOM). Money is integer cents.

---

## Phase 1 — Tiered pricing engine

### Task 1.1: `soccerone-pricing.ts` (pure, timezone-aware, per-hour)

**Files:**
- Create: `src/lib/rentals/soccerone-pricing.ts`
- Test: `tests/unit/rentals/soccerone-pricing.test.ts`

- [ ] **Step 1: Write the failing test** (exact):

```ts
// tests/unit/rentals/soccerone-pricing.test.ts
import { describe, it, expect } from "vitest"
import { resolveSeason, resolveHourRateCents, quoteRentalCents } from "@/lib/rentals/soccerone-pricing"

const TZ = "America/New_York"
// Helper: build a UTC Date. ET offset is -4 in summer (EDT), -5 in winter (EST).
const utc = (iso: string) => new Date(iso)

describe("soccerone rental pricing", () => {
  it("resolveSeason: Apr–Sep = summer, Oct–Mar = winter", () => {
    expect(resolveSeason(4)).toBe("summer")
    expect(resolveSeason(9)).toBe("summer")
    expect(resolveSeason(10)).toBe("winter")
    expect(resolveSeason(3)).toBe("winter")
    expect(resolveSeason(12)).toBe("winter")
  })

  it("summer weekday tiers (Wed 2026-07-15, EDT = UTC-4)", () => {
    // 10:00 ET = 14:00Z (before 3)
    expect(resolveHourRateCents(utc("2026-07-15T14:00:00Z"), TZ)).toBe(11000)
    // 16:00 ET = 20:00Z (3–6)
    expect(resolveHourRateCents(utc("2026-07-15T20:00:00Z"), TZ)).toBe(17000)
    // 19:00 ET = 23:00Z (after 6)
    expect(resolveHourRateCents(utc("2026-07-15T23:00:00Z"), TZ)).toBe(19000)
  })

  it("summer weekend is always top tier (Sat 2026-07-18, 10:00 ET = 14:00Z)", () => {
    expect(resolveHourRateCents(utc("2026-07-18T14:00:00Z"), TZ)).toBe(19000)
  })

  it("winter weekday tiers (Wed 2026-01-14, EST = UTC-5)", () => {
    // 10:00 ET = 15:00Z (before 3)
    expect(resolveHourRateCents(utc("2026-01-14T15:00:00Z"), TZ)).toBe(13000)
    // 16:00 ET = 21:00Z (3–6)
    expect(resolveHourRateCents(utc("2026-01-14T21:00:00Z"), TZ)).toBe(18500)
    // 20:00 ET = 2026-01-15T01:00:00Z (after 6)
    expect(resolveHourRateCents(utc("2026-01-15T01:00:00Z"), TZ)).toBe(26000)
  })

  it("quoteRentalCents sums per hour, crossing the 6pm boundary (summer Wed 5–7pm ET)", () => {
    // 17:00 ET = 21:00Z (midday 17000) + 18:00 ET = 22:00Z (evening 19000) = 36000
    expect(quoteRentalCents(utc("2026-07-15T21:00:00Z"), utc("2026-07-15T23:00:00Z"), TZ)).toBe(36000)
  })

  it("quoteRentalCents: winter weekend 3 hours = 3 × 26000", () => {
    // Sat 2026-01-17, 17:00 ET = 22:00Z, for 3 hours
    expect(quoteRentalCents(utc("2026-01-17T22:00:00Z"), utc("2026-01-18T01:00:00Z"), TZ)).toBe(78000)
  })

  it("quoteRentalCents returns 0 when endsAt <= startsAt", () => {
    expect(quoteRentalCents(utc("2026-07-15T21:00:00Z"), utc("2026-07-15T21:00:00Z"), TZ)).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verify it fails** — `npm run test:unit -- tests/unit/rentals/soccerone-pricing.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** (exact):

```ts
// src/lib/rentals/soccerone-pricing.ts
// SoccerOne field-rental pricing: seasonal × time-of-day tiers, summed per hour.
// Pure (no DB). Rates are typed config (admin-editable rates are a follow-up).
// See docs/superpowers/specs/2026-06-19-soccerone-rental-revamp-design.md.

export type RentalSeason = "summer" | "winter" // summer = Apr–Sep, winter = Oct–Mar
type RentalTier = "before3" | "midday" | "evening" // weekday tiers; weekend is always "evening"

/** Per-hour rates in cents. */
const SCHEDULE: Record<RentalSeason, Record<RentalTier, number>> = {
  summer: { before3: 11000, midday: 17000, evening: 19000 },
  winter: { before3: 13000, midday: 18500, evening: 26000 },
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

interface LocalParts { month: number; weekday: number; hour: number }

/** Wall-clock parts of `date` in the given IANA timezone. */
function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, month: "numeric", weekday: "short", hour: "numeric", hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  let hour = parseInt(get("hour"), 10)
  if (hour === 24) hour = 0 // hour12:false can render midnight as "24"
  return { month: parseInt(get("month"), 10), weekday: WEEKDAY[get("weekday")], hour }
}

export function resolveSeason(month: number): RentalSeason {
  return month >= 4 && month <= 9 ? "summer" : "winter"
}

/** Rate (cents) for the one-hour block starting at `hourStart`, resolved in `timeZone`. */
export function resolveHourRateCents(hourStart: Date, timeZone: string): number {
  const { month, weekday, hour } = localParts(hourStart, timeZone)
  const season = resolveSeason(month)
  const isWeekend = weekday === 0 || weekday === 6
  const tier: RentalTier = isWeekend ? "evening" : hour < 15 ? "before3" : hour < 18 ? "midday" : "evening"
  return SCHEDULE[season][tier]
}

/** Total (cents) for [startsAt, endsAt), summed per whole hour. Bookings are whole-hour. */
export function quoteRentalCents(startsAt: Date, endsAt: Date, timeZone: string): number {
  const ms = endsAt.getTime() - startsAt.getTime()
  if (ms <= 0) return 0
  const hours = Math.round(ms / 3_600_000)
  let total = 0
  for (let i = 0; i < hours; i++) {
    total += resolveHourRateCents(new Date(startsAt.getTime() + i * 3_600_000), timeZone)
  }
  return total
}

/** The schedule, exposed for the rates-table display so UI can't drift from pricing. */
export const RENTAL_RATE_SCHEDULE = SCHEDULE
```

- [ ] **Step 4: Run, verify pass** — `npm run test:unit -- tests/unit/rentals/soccerone-pricing.test.ts` → 7 passing.
- [ ] **Step 5: Type-check** — `npx tsc --noEmit` → 0 errors.
- [ ] **Step 6: Commit**

```bash
git add src/lib/rentals/soccerone-pricing.ts tests/unit/rentals/soccerone-pricing.test.ts
git commit -m "feat(rentals): SoccerOne tiered per-hour pricing engine"
```

---

## Phase 2 — Wire the engine into the booking API

### Task 2.1: SoccerOne-gated tiered pricing in the booking handler

**Files:**
- Modify: `src/pages/api/rentals/bookings/index.ts` (the base-price computation, ~lines 138–142 per the map)

Read the handler first. Today it does:
`const hourlyRate = resolveRentalHourlyRateCents(venue.rentalHourlyRateCents, rateCard.defaultHourlyRateCents)` then `const basePrice = computeRentalPriceCents(startsAt, endsAt, hourlyRate)`. The member discount step (`getActiveMembershipForOrg` → `applyMemberRentalDiscount`) runs after and is unchanged.

- [ ] **Step 1: Add the org-gated branch.** Load the org slug (the handler already has `organization`/`organizationId` in scope via `locals.organization`; confirm and use it) and the org timezone (`locals.organization.timezone ?? "America/New_York"`). Replace the `basePrice` computation with:

```ts
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing"
// ... inside the handler, where basePrice is computed:
const orgTimeZone = locals.organization?.timezone ?? "America/New_York"
const basePrice =
  locals.organization?.slug === "soccerone"
    ? quoteRentalCents(startsAt, endsAt, orgTimeZone)
    : computeRentalPriceCents(
        startsAt,
        endsAt,
        resolveRentalHourlyRateCents(venue.rentalHourlyRateCents, rateCard.defaultHourlyRateCents),
      )
```
Keep the existing member-discount step (it consumes `basePrice`). Confirm `locals.organization` exposes `slug` and `timezone`; if the handler uses a different org accessor, mirror it. Do NOT change Stripe/hold/conflict logic.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → 0 errors. Add/extend an API test if one exists for rentals (`tests/api/`), asserting a SoccerOne multi-hour booking quote matches `quoteRentalCents`. If no rentals API test harness exists, note it and rely on the unit-tested engine + manual verification (do NOT fabricate one).
- [ ] **Step 3: Build** — `npm run build` → no error referencing the bookings route.
- [ ] **Step 4: Commit**

```bash
git add src/pages/api/rentals/bookings/index.ts
git commit -m "feat(rentals): SoccerOne bookings priced via tiered engine (Aspire unchanged)"
```

### Task 2.2: Set SoccerOne `cancelWindowHours = 336` (14 days)

**Files:** the SoccerOne `field_rental_rate_card` row (data). The rate card is per-org and auto-upserted with defaults (24h) by the booking handler.

- [ ] **Step 1:** Determine the mechanism — check for a rate-card admin endpoint/page or a seed. If `scripts/seed-soccerone-org.ts` provisions rentals config, set `cancelWindowHours: 336` there (idempotent). Otherwise add a one-line idempotent update to that script: set the SoccerOne org's `field_rental_rate_card.cancelWindowHours = 336` (upsert if missing, using the same defaults the handler uses but with 336). This is a data/config change run via the seed path — NOT a schema migration.
- [ ] **Step 2: Verify** the seed runs idempotently (`tsx scripts/seed-soccerone-org.ts` against a localhost/staging DB; it's guarded to safe hosts). Confirm the row shows `cancel_window_hours = 336` for the SoccerOne org.
- [ ] **Step 3: Commit**

```bash
git add scripts/seed-soccerone-org.ts
git commit -m "chore(soccerone): 14-day rental cancellation window (cancelWindowHours=336)"
```

---

## Phase 3 — FieldCalendar multi-hour + live member-aware total

### Task 3.1: Duration selector + live tiered total

**Files:**
- Modify: `src/components/soccerone/FieldCalendar.tsx`

The component is single-hour (hardcoded `endsAt = startsAt + 60min`, `baseRate = 80`). `RentalBooking.tsx` has the proven multi-hour logic (`DURATIONS = [60,90,120,180,240]`, `availableDurations` capped by the free block). Read both first.

- [ ] **Step 1:** Add a duration selector to FieldCalendar, modeled on `RentalBooking.tsx`:
  - State `durationMinutes` (default 60). Compute `availableDurations` from the selected free block's end and the rate card's `maxDurationMinutes` (240). Reset to the largest available if the current selection no longer fits.
  - **SoccerOne rentals are whole-hour** — restrict the selector to whole-hour options `[60, 120, 180, 240]` (not 90). Booking `endsAt = startsAt + durationMinutes`.
- [ ] **Step 2:** Replace the static `baseRate = 80` display with the **live tiered total** using the shared engine:
  - Import `quoteRentalCents` from `@/lib/rentals/soccerone-pricing`.
  - Accept new props: `timeZone: string` and `memberDiscountPct: number` (passed from `rent.astro`; default 0).
  - For the selected slot + duration, compute `standardCents = quoteRentalCents(startsAt, endsAt, timeZone)`. If `memberDiscountPct > 0`, also show `memberCents = Math.round(standardCents * (1 - memberDiscountPct/100))`. Display dollars (`$${Math.round(cents/100)}` or `(cents/100).toFixed(0)`), with a member line; if `memberDiscountPct === 0`, show a "Members save up to 25% — sign in" nudge instead.
  - Remove the old "Members save $8/hr" copy.
- [ ] **Step 3:** Booking POST: send `startsAt` and `endsAt = startsAt + durationMinutes` (the API already accepts any `endsAt`). No other contract change.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` → 0 errors; `npm run build` → island bundles. (Rendered behavior verified via Playwright in Task 3.2 / manual.)
- [ ] **Step 5: Commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx
git commit -m "feat(soccerone): multi-hour field booking + live tiered member-aware total"
```

### Task 3.2: E2E — multi-hour total renders

**Files:** Create `tests/e2e/soccerone-rental-pricing.spec.ts`

- [ ] **Step 1:** Write a Playwright spec (mirror the skip-guard idiom of `tests/e2e/soccerone-leagues-finder.spec.ts`, since SoccerOne may not be seeded — `test.skip` when the calendar/venues aren't present). On `soccerone.localhost/rent`: wait for hydration, select a slot, change duration to 2 hours, assert the displayed total updates to a 2-hour tiered figure (or skip if no availability). Keep assertions resilient.
- [ ] **Step 2:** `npx playwright test soccerone-rental-pricing --list` → parses; `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit**

```bash
git add tests/e2e/soccerone-rental-pricing.spec.ts
git commit -m "test(e2e): soccerone multi-hour rental total"
```

---

## Phase 4 — rent.astro: rates table, disclaimer, cancellation, member prop

### Task 4.1: Replace static pricing block; pass member discount + timezone to FieldCalendar

**Files:**
- Modify: `src/pages/soccerone/rent.astro` (static pricing ~lines 69–86; FieldCalendar mount ~line 143)

- [ ] **Step 1: Member prop (SSR).** In frontmatter, look up the signed-in user's rental discount: if `locals.user`, call `getActiveMembershipForOrg(locals.user.id, orgId)` (`src/lib/memberships/get-active-membership.ts`) and read `tier.benefits.rental_discount_pct ?? 0`; else 0. Compute `const orgTimeZone = locals.organization?.timezone ?? "America/New_York"`. Pass to the island: `<FieldCalendar client:load venues={calendarVenues} timeZone={orgTimeZone} memberDiscountPct={memberDiscountPct} />`.
- [ ] **Step 2: Tiered rates table.** Replace the static `$80/$72/$64` block with a table rendered from `RENTAL_RATE_SCHEDULE` (import from `@/lib/rentals/soccerone-pricing`) — two seasons × three tiers (label the columns "Weekday before 3 PM", "Weekday 3–6 PM", "Weekday after 6 PM & weekends"; rows "Apr–Sep", "Oct–Mar"; values `$${cents/100}`). Add a line: "Members save 10% · founding members 25%." Style with `--so-*` tokens (this is Astro markup — scoped `<style>` is fine).
- [ ] **Step 3: Disclaimer.** Add a prominent note: "Field rental availability is very limited on weekends between November and March, and on weekdays after 6 PM." (lime-accented info style.)
- [ ] **Step 4: Cancellation copy.** Near the booking action: "Cancel 14+ days out for a full refund. Within 14 days, bookings are final."
- [ ] **Step 5: Verify** — `npx tsc --noEmit` → 0; `npm run build` → no rent.astro error; `prerender = false` unchanged.
- [ ] **Step 6: Commit**

```bash
git add src/pages/soccerone/rent.astro
git commit -m "feat(soccerone): tiered rates table, availability disclaimer, 14-day cancel copy, member-aware booking"
```

---

## Phase 5 — Package-request form

### Task 5.1: "Request a package" inquiry

**Files:**
- Read: `src/pages/api/public/corporate-inquiry.ts` + its schema/email pattern.
- Create: `src/components/soccerone/RentalPackageRequest.tsx` (or an Astro form section if it matches the corporate-inquiry submission pattern).
- Modify: `src/pages/soccerone/rent.astro` (mount the section below the booking calendar).

- [ ] **Step 1:** Mirror the corporate-inquiry submission flow for a rental package request: fields = organization, contact name, email (required), desired dates/duration, message. Submit to the corporate-inquiry endpoint tagged as a rental-package request (add a `type`/`source` field if the endpoint supports it; otherwise include it in the message). If the endpoint's schema can't carry the tag cleanly, add a minimal optional field rather than a whole new endpoint. Do NOT build a new table if corporate-inquiries fits.
- [ ] **Step 2:** Add the section to `rent.astro` with copy: heading "Need a package?" / body "Booking 10+ hours, a recurring slot, or a tournament block? Tell us what you need and we'll build a custom package." + the form. SoccerOne dark/lime styling. If it's a React island, embedded `<style>`; if Astro, scoped `<style>`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` → 0; `npm run build` → clean for rent.astro.
- [ ] **Step 4: Commit**

```bash
git add src/components/soccerone/RentalPackageRequest.tsx src/pages/soccerone/rent.astro src/pages/api/public/corporate-inquiry.ts
git commit -m "feat(soccerone): rental package-request inquiry on /rent"
```

---

## Phase 6 — Member tier-benefit config (data)

### Task 6.1: Set `rental_discount_pct` (Founder 25 / others 10)

**Files:** SoccerOne `membership_tiers.benefits` (data).

- [ ] **Step 1:** Determine the mechanism — membership-tier admin endpoint/page, or the seed (`scripts/seed-soccerone-org.ts` / a tiers seed). Set each SoccerOne tier's `benefits.rental_discount_pct`: the **founding** tier = `25`, all other tiers = `10`. Preserve existing benefits (merge, don't overwrite). Identify the founding tier by its name/flag (check how tiers are named — e.g. "Founder"/"Founding"). Make the change idempotent in the seed if done there.
- [ ] **Step 2: Verify** the tiers' `benefits` JSON contains the right `rental_discount_pct` per tier (query or seed output). Confirm the booking handler's member-discount path reads it (it already does).
- [ ] **Step 3: Commit**

```bash
git add <seed or config file touched>
git commit -m "chore(soccerone): rental member discount — founder 25%, others 10%"
```

---

## Phase 7 — Pickup jump-link overshoot fix (carry-over)

### Task 7.1: Stabilize the `#sessions` anchor target

**Files:**
- Modify: `src/pages/soccerone/pickup.astro` (the `#sessions` section + the `.pickup-games-wrap`/`PickupGames` mount)

`PickupGames` is `client:visible`; on a cold click the cards haven't taken height so the `#sessions` anchor overshoots onto the how-strip.

- [ ] **Step 1:** Reserve height + offset: add `scroll-margin-top` to `#sessions` (≈ the sticky header height, e.g. `6rem`) and a `min-height` to `.pickup-games-wrap` (enough for the loading state, e.g. `min-height: 60vh`) so page height is stable before the island loads. If that proves insufficient, change `<PickupGames client:visible ...>` to `client:load`. (These are Astro-scoped styles on `pickup.astro` — fine.)
- [ ] **Step 2: Verify** — `npm run build` → no pickup error; manual/Playwright: clicking "See tonight's sessions ↓" lands on the switcher+cards, not past them.
- [ ] **Step 3: Commit**

```bash
git add src/pages/soccerone/pickup.astro
git commit -m "fix(soccerone): stabilize pickup #sessions jump-link target"
```

---

## Out of scope / follow-ups
- Admin-editable tiered rates (DB-backed); add-ons; partial-field bookings; check-in UX; partial refunds; unifying FieldCalendar with RentalBooking.

## Self-review notes
- **Spec coverage:** pricing engine → P1; org-gated charge + cancel window → P2; multi-hour + live member total → P3; rates table/disclaimer/cancel copy/member prop → P4; package path → P5; member 25/10 config → P6; jump-link fix → P7.
- **Testing strategy:** the pricing engine is fully TDD'd (P1); the API swap is type-checked + (if a harness exists) an API test; UI is build/tsc + Playwright (skip-guarded, since SoccerOne e2e only runs post-merge in `test-full`).
- **Type consistency:** `quoteRentalCents(startsAt, endsAt, timeZone)`, `resolveHourRateCents`, `resolveSeason`, `RENTAL_RATE_SCHEDULE`, and the `timeZone`/`memberDiscountPct` FieldCalendar props are defined in P1/P3/P4 and used consistently.
- **Data vs code:** `cancelWindowHours` (P2) and `rental_discount_pct` (P6) are data/config via the seed, not schema migrations.
