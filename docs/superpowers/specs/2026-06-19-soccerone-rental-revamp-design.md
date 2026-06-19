# SoccerOne Field Rental Revamp — Design

**Date:** 2026-06-19
**Status:** Approved design → ready for implementation plan
**Author:** brainstormed with Mahad

## Summary

Revamp the SoccerOne field-rental page (`/rent`) to: charge the real **seasonal, time-of-day tiered** rates instead of a flat $80/hr; support **multi-hour bookings**; apply **tier-specific member discounts** (founding 25%, other members 10%); show the **availability disclaimer**; keep **online book-and-pay** (existing Stripe flow); add a **package-request path** for bulk/recurring deals; and enforce a strict **14-day cancellation** policy. Bundles one small carry-over fix: the pickup hero jump-link overshoot.

The existing rental infrastructure is reused wherever possible — only the pricing model, the booking UI's hour-count, and copy/config are genuinely new.

## What already exists (reuse, do not rebuild)
- `field_rentals` table — full booking model (time range, `amountDueCents`, status, Stripe fields, holds, cancellation). `field_rental_rate_card` — per-org config incl. `cancelWindowHours`, min/max duration.
- Ledger-based availability + transaction-locked conflict detection (`resource_blocks`, `src/lib/rentals/availability.ts`, `conflicts.ts`).
- Stripe checkout + webhook + refund-on-cancel (`POST /api/rentals/bookings`, `handle-field-rental-checkout-complete.ts`, `bookings/[id]/cancel.ts`).
- Member-discount mechanism: `getActiveMembershipForOrg()` → `tier.benefits.rental_discount_pct` → `applyMemberRentalDiscount()`. **Per-tier**, so founding=25 / others=10 maps directly.
- **Multi-hour UI already exists** in `src/components/rentals/RentalBooking.tsx` (duration selector 60–240 min). SoccerOne's `FieldCalendar.tsx` is the single-hour one — we port the proven duration logic into it.
- `corporate-inquiries` table + endpoint — reuse for the package-request path.

## The tiered rate schedule (typed config — decision: code, not DB)
Stored as a typed module (rarely changes; admin-editable rates are a noted follow-up). Per hour:

| Season | Weekday before 3 PM | Weekday 3–6 PM | Weekday after 6 PM **& all weekend** |
|---|---|---|---|
| **Apr–Sep** | $110 | $170 | $190 |
| **Oct–Mar** | $130 | $185 | $260 |

(Source of truth: the [[soccerone-field-rental-pricing]] memory.)

## Architecture

### 1. Pricing engine — `src/lib/rentals/soccerone-pricing.ts` (pure, unit-tested)
- A typed `RENTAL_RATE_SCHEDULE` holding the six rates above (cents).
- `resolveHourRateCents(localHourStart): number` — given the **local** (org-timezone) start of a one-hour block, determine season (month Apr–Sep = summer, else winter), day-type (Sat/Sun = weekend), and time tier (weekday: `<15:00` before-3, `15:00–17:59` 3-to-6, `>=18:00` after-6; weekend: always the top tier), and return the rate.
- `quoteRentalCents(startsAt, endsAt, timeZone): number` — **sum per one-hour block** across the range. This correctly prices blocks that cross a tier boundary (e.g. a summer weekday 5–7 PM = $170 + $190 = $360). Bookings are whole-hour increments, so the loop is exact.
- **Timezone is load-bearing:** times are stored UTC; season/day/time tiers are about *local* Columbus time. The engine takes an explicit IANA `timeZone` (the org's, `America/New_York`) and resolves each hour's local wall-clock via `Intl.DateTimeFormat` parts (no external dep). Unit tests cover: each tier, the summer/winter boundary, weekend = top tier, a tier-crossing multi-hour block, and a DST-boundary block.

### 2. Booking API — wire the engine in (`src/pages/api/rentals/bookings/index.ts`)
- Replace the flat `computeRentalPriceCents()` **for the SoccerOne org only** (gate by org slug `soccerone`; other orgs keep the existing flat rate-card path — Aspire is unaffected). The member-discount step (`applyMemberRentalDiscount` using `rental_discount_pct`) is unchanged and applies on top of the tiered base.
- Everything else (hold creation, conflict check, Stripe session, webhook) is untouched.

### 3. Member discount config (data, not code)
- Set `rental_discount_pct` in tier `benefits`: **Founder tier = 25**, all other SoccerOne tiers = **10**. Applied via the existing mechanism; the founding tier keeps its existing free-pickup benefit.
- This is a data change to `membership_tiers.benefits` (via the membership-tier admin or a small seed step), documented in the plan — not application code.

### 4. Multi-hour booking UI (`src/components/soccerone/FieldCalendar.tsx`)
- Add a duration/range selector (port the `availableDurations` logic from `RentalBooking.tsx`, capped by the selected free block and the rate card's `maxDurationMinutes`).
- **Live total**: import the pure `soccerone-pricing.ts` engine (it's framework-agnostic) to show the exact total as the range changes — the same function the server charges with, so quote == charge.
- **Member-aware display**: `rent.astro` SSR-looks-up the signed-in user's `rental_discount_pct` (0 if not a member / not signed in) and passes it as a prop. FieldCalendar shows the standard total and, when `pct > 0`, the discounted total; otherwise a "Members save up to 25% — sign in" nudge. The server re-applies the discount authoritatively at booking.
- Booking POST sends the full `startsAt`/`endsAt`; no API contract change.

### 5. `rent.astro` — rates, disclaimer, cancellation copy
- Replace the static $80/$72/$64 block with the **tiered schedule table** (rendered from the same typed config so display can't drift from the engine).
- **Disclaimer** (prominent): "Field rental availability is very limited on weekends between November and March, and on weekdays after 6 PM."
- **Cancellation copy** near the booking action: "Cancel 14+ days out for a full refund. Within 14 days, bookings are final." Plus set the SoccerOne rate card's `cancelWindowHours = 336` (data/config; the existing cancel endpoint enforces it).

### 6. Package-request path
- A section on `/rent`: "Booking 10+ hours or a recurring slot? **Request a package →**" opening a lightweight inquiry form (organization, contact name, email, desired dates/duration, message), submitting via the existing `corporate-inquiries` infrastructure tagged as a rental-package request (stored + emailed, matching the existing inquiry pattern). Copy written as part of the build.

### 7. Carry-over: pickup jump-link overshoot
- `PickupGames` is `client:visible`, so on a cold click the cards haven't taken height and the `#sessions` anchor overshoots onto the how-strip. Fix: reserve a `min-height` on the games container (stable page height regardless of async load) **and** add `scroll-margin-top` to `#sessions` for the sticky header offset. (Switch to `client:load` only if the reservation proves insufficient.)

## Files touched
- New: `src/lib/rentals/soccerone-pricing.ts` (+ `tests/unit/rentals/soccerone-pricing.test.ts`)
- Modify: `src/pages/api/rentals/bookings/index.ts` (org-gated engine swap), `src/components/soccerone/FieldCalendar.tsx` (multi-hour + live total), `src/pages/soccerone/rent.astro` (rates/disclaimer/cancellation/member prop/package section), `src/pages/soccerone/pickup.astro` (jump-link fix)
- New: a small rental-package inquiry component + reuse of the corporate-inquiries endpoint
- Config/data (in the plan, not app code): SoccerOne rate card `cancelWindowHours=336`; tier `benefits.rental_discount_pct` (Founder 25 / others 10)

## Phasing (each a reviewable step; ships as one PR)
1. Pricing engine (pure module + tests)
2. Booking API wired to the engine (org-gated) + cancelWindowHours config
3. FieldCalendar multi-hour + live member-aware total
4. `rent.astro` rates table + disclaimer + cancellation copy + member prop
5. Package-request form
6. Member tier-benefit config (25/10) — data step
7. Pickup jump-link fix

## Out of scope / follow-ups
- Admin-editable tiered rates (DB-backed) — typed config for now.
- Add-ons (referee, balls), partial-field bookings, check-in UX, partial refunds.
- Unifying `FieldCalendar` and Aspire's `RentalBooking` into one component.

## Success criteria
- A multi-hour SoccerOne rental is charged the exact per-hour tiered total (verified across a tier-crossing block), with the member discount (25% founder / 10% other) applied for signed-in members.
- The live total in `FieldCalendar` equals the amount Stripe charges.
- The disclaimer and 14-day cancellation policy are shown; `cancelWindowHours=336` enforced.
- Package-request inquiries are captured.
- Aspire rentals are unchanged (flat rate path intact).
- Pickup jump-link lands on the cards, not past them.
- Pricing engine unit tests pass (tiers, season boundary, weekend, tier-crossing, DST).
