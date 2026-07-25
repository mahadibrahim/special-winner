# SoccerOne rentals page UX refresh — design

**Date:** 2026-07-18
**Branch:** `feat/rentals-ux-refresh` (worktree off `main`)
**Scope:** SoccerOne `/soccerone/rent` first, then propagate brand-agnostic changes to Aspire `/rentals`.

## Context

This is **Sub-project 1** of a two-part rentals UX effort. It ships the visible
correctness + UX wins. **Sub-project 2** (per-player emailed waiver signing) is a
separate spec/plan.

The rentals page (`src/pages/soccerone/rent.astro` + `src/components/soccerone/FieldCalendar.tsx`,
and Aspire's `src/components/rentals/RentalBooking.tsx`) went live with the
request→approve→pay flow (PR #419) but carries stale copy, member-pricing
messaging the owner is retiring, a numbered-step system the owner dislikes,
inconsistent field naming/data, and no per-field info in the booking flow.

## Ground-truth facts (from owner + location pages)

- **Worthington** (535 Lakeview Plaza Blvd, Worthington OH): two fields —
  **Orange** and **Blue** — each **110×60**, boarded, sand-filled turf.
- **Downtown** (980 E Starr Ave, Columbus OH): one field — **Yellow** —
  **130×45**, built for 6v6.
- **Futsal courts** open **September** (at least two games' worth; count not
  finalized). Show now to gather early interest.
- The venue table currently also has a spurious **"Field 3"** at Worthington
  (seen in the live selector) — a data error to remove.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Member pricing | **Remove from UI AND kill the discount logic on rentals.** Also neutralize the member booking-window extension for rentals (flat window for all) — flagged for veto. |
| Player selector / waiver | Interim only in this sub-project: keep player count, add "every player must sign a waiver; each gets a link after approval" language. Full per-player emailed signing → Sub-project 2. |
| Field info | Per-field info cards (dimensions + surface/format + location-in-facility), reusing existing specs. |
| Futsal | Generic "Coming September" + email interest capture. |
| Numbered steps | Remove the "01./02." numbered system → clean headings. |
| Propagation | Brand-agnostic changes → Aspire `/rentals` (`RentalBooking`). |

## Changes

### 1. Field data correction (DB + code)
- Remove the spurious **"Field 3"** venue at Worthington so the selector shows
  only **Orange** and **Blue**; confirm **Downtown = Yellow**. This is a data
  fix on the venues table (staging + prod), done via a guarded one-off script
  or an idempotent seed/migration-style correction — NOT `db:push`. The exact
  venue ids are resolved at implementation time by querying
  `venues` for the SoccerOne org's Worthington location.
- `rent.astro` field count/labels derive from the actual returned venues rather
  than the hardcoded `fieldCount = facility === 'downtown' ? '1 field' : '2 fields'`.

### 2. Copy correctness (`rent.astro`, `FieldCalendar.tsx`)
- **Address per facility**: Worthington → **535 Lakeview Plaza Blvd, Worthington, OH**;
  Downtown → 980 E Starr Ave. (Currently hardcoded to Starr Ave for both.)
- Replace booking-window copy: "Online booking opens 7 days ahead — email … for
  later dates" and "Book up to 14 days ahead with Founder membership" →
  request-flow language: requests reviewed by the venue, a secure pay link is
  emailed on approval, **requests open up to 7 days out and must be at least 48
  hours ahead** (call/email for sooner or further).
- Meta `title`/`description`: correct field counts, drop member claims.
- Remove the "all 4 indoor fields" line; reflect real counts (2 Worthington,
  1 Downtown, futsal coming).

### 3. Remove member pricing (UI + logic)
- **UI**: delete "Members save up to 25% — sign in" (FieldCalendar), the
  rates-table member note (`rt-member-note`), and the "Member and Founder rates
  apply automatically" CTA band (`.rmc-*` section) in `rent.astro`.
- **Logic**: rentals no longer apply `applyMemberRentalDiscount` — the public
  booking endpoint (`src/pages/api/rentals/bookings/index.ts`) and the SoccerOne
  price display compute the base rate only. Remove the `memberDiscountPct` prop
  plumbed into `FieldCalendar`.
- **Booking window**: rentals use the flat `DEFAULT_BOOKING_WINDOW_DAYS` for
  everyone; drop the `resolveBookingWindowDays` membership extension on the
  rentals path (`rent.astro` + endpoint). *(Flagged: veto if the window perk
  should stay.)*
- Leaves the membership *system* intact everywhere else — this is rentals-only.

### 4. Drop the numbered-step system (`rent.astro`, `FieldCalendar.tsx`)
- Remove the `01.`/`02.` `section-num` / `section-num-sm` treatment and the
  numbered step framing (e.g. "01. Select a Time Slot"). Replace with clean
  section headings ("Select a time slot", etc.) — no numbers.

### 5. Per-field info cards (`FieldCalendar.tsx`, data source)
- Each field surfaces: **dimensions** (Orange/Blue 110×60; Yellow 130×45),
  **surface/format** (boarded sand-filled turf; 6v6), and **location within the
  facility**. Reuse the specs/diagrams already present on the Worthington/
  Downtown pages.
- Source: a small static field-info map keyed by field name/venue (the specs are
  static marketing data; a config object next to the SoccerOne venue helpers is
  simplest and matches how `rent.astro` already hardcodes field descriptors).
  A facility-map image slot is included if an asset exists; otherwise a
  location description string.
- The field selector switches to a form that shows the selected field's card
  (not just a `<select>` of names) so users can compare before requesting.

### 6. Futsal "Coming September" + interest capture
- A futsal section on `rent.astro` marked **Coming September** (generic, no court
  count) with a short **email interest-capture** ("Notify me when futsal opens").
- Capture mechanism: a small `POST /api/soccerone/futsal-interest` endpoint that
  stores the email (new lightweight table `futsal_interest`, or reuse an existing
  contact/lead store if one fits — resolved at implementation time) and confirms.
  Respects `MESSAGING_*` gating if it sends a confirmation. Admin can read the
  list (query/CSV; no admin UI required in this sub-project).

### 7. Interim waiver language (bridge to Sub-project 2)
- Keep the current player-count + single waiver. Add clear copy that **every
  player must have a signed waiver on file to play** — setting the expectation
  now. Do NOT promise the emailed per-player signing flow in copy yet (that
  mechanism ships in Sub-project 2); phrase it as a requirement, not a promise
  of a specific not-yet-built flow. No functional waiver change in this
  sub-project.

### 8. Propagate to Aspire (`RentalBooking.tsx`, `/rentals` page)
- Apply brand-agnostic changes: member-pricing UI removal, member discount +
  window logic removal (shared endpoint already covered by #3), numbered-system
  removal, request/48h copy hygiene, and the waiver-expectation language.
- Field-info cards and futsal are SoccerOne-specific; Aspire gets them only if
  Aspire has comparable field data (out of scope unless trivial).

## Non-goals

- Per-player emailed waiver signing (Sub-project 2).
- Any change to the request→approve→pay backend flow, Stripe, or admin approval.
- Futsal court modeling/booking (not live until September).
- New admin UI for futsal interest (a queryable list suffices for now).

## Risks / notes

- **DB data fix** (removing "Field 3") touches staging + prod venue data —
  do it via a guarded, idempotent one-off script (resolve ids by query; scope to
  the SoccerOne org's Worthington location), reviewed before running. Never
  `db:push`.
- **Member-discount removal on the shared endpoint** affects Aspire too by
  design (rentals are one API). Confirm no Aspire tier currently depends on it
  (Aspire has no seeded tiers per prior notes, so this is inert there).
- **Prerender**: `rent.astro` is `prerender = false` (reads `?facility`), stays SSR.
- Verify in a browser on BOTH brands (accent tokens are never a text colour;
  SoccerOne BrandTheme inverts Aspire tokens).

## Sub-project 2 (separate spec) — for reference
Per-player emailed waiver signing: capture each player's name + email at request
time; after approval mint a `field_rental`/new-kind self-service token per player
and email a signing link (reuse `self_service_tokens` + `send-link`); track
per-player signature status on the rental; surface completion to admin. Its own
spec → plan → implementation cycle.
