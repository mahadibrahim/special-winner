# Kiosk: location-scoped front desk + "Space" relabel — design

**Date:** 2026-05-21
**Status:** approved (design)

## Problem

A kiosk is a facility's **front desk** — the kiosk page is literally titled
"§ The Front Desk." But the kiosk is currently scoped to a single `venue`,
and a `venue` is not a facility — it's a bookable area *inside* a facility:

- `locations` carries facility identity — full address, lat/long, phone,
  email, timezone, a subdomain, and its own `slug`. **This is the facility.**
- `venues` hangs off a location with `fieldCount`, indoor/outdoor,
  concessions, parking, rental config, and a partner Stripe account — a
  bookable **space within** the facility.

Consequences:

1. **Functional bug.** Worthington has two bookable spaces (growing to
   three). A venue-scoped kiosk only ever shows one space's sessions, so a
   walk-in at the Worthington front desk can't see or register for a game
   in the other space. Downtown (one space) masks the bug today.
2. **Naming.** "Venue" is the wrong word for "a bookable area within a
   facility." It should read "Space" everywhere a human sees it.
3. **Wrong-layer slug.** PR #116 added `venues.slug` for friendly kiosk
   URLs — but `locations` already has a `slug`, and the kiosk belongs at
   the facility layer.

## Decisions

- The kiosk is **location-scoped** — one kiosk per facility.
- The `venues` → "Space" rename is **UI labels only**. The `venues` table
  and `venueId` identifiers stay as internal names (a full table/column
  rename touches ~60 files and needs a destructive migration — pure cost,
  no functional gain).
- The user-facing term is **"Space"**.

## Design

### Part 1 — Re-scope the kiosk from venue to location

The kiosk resolves a **facility (location)** and shows everything happening
across all of that facility's spaces.

- **Route:** `/kiosk/[venueSlug]` → `/kiosk/[locationSlug]`, resolved
  against `locations.slug` (already exists: required, unique per org — no
  new column, no backfill).
- **Resolver:** `requireKioskVenue` → `requireKioskLocation` in
  `src/lib/check-in/kiosk-auth.ts`. Resolves slug-or-UUID to a location.
  Every current caller is a kiosk endpoint, so it is a clean swap.
- **`/api/kiosk/[locationSlug]/sessions`** — today's `scheduled` drop-in
  sessions across every venue in the location (join `venues` on
  `locationId`). Each session result includes its space (venue) name.
- **`/api/kiosk/[locationSlug]/search`** — drop-in bookings and field
  rentals across the whole location (join `venues`, filter by `locationId`).
- **`walkin/start`** — validates the chosen session's venue belongs to
  this location.
- **`walkin/payment`** — unchanged logic; it already derives the venue
  (and its partner Stripe account) from the booking's session.
- **`token-for-target`** — unchanged; already returns a relative URL.
- **Kiosk UI** (`KioskLanding`, `FindBooking`, `WalkInWizard`) — the
  `venueSlug` prop becomes `locationSlug`; the walk-in session picker and
  find-booking results show each session's **space name**, since a
  facility can now run sessions in several spaces at once.

Net result: one kiosk URL per facility — `/kiosk/worthington` shows all of
Worthington's spaces at once. Downtown is unchanged in behavior.

`locations.slug` is unique per `(organizationId, slug)`, not globally
unique. The kiosk route is single-org in practice (Aspire is one org) and
this matches how location subdomains already resolve; acceptable.

### Part 2 — Relabel "Venue" → "Space" in the UI (labels only)

Replace the user-visible word only:

- **Admin** (`venues-list.tsx`, the Locations & venues page): "Venues" tab
  and heading → "Spaces"; "Add Venue" → "Add Space"; "Venue Name" →
  "Space Name"; "Locations & venues" → "Locations & spaces"; etc.
- **`/dropin`** customer filter: the "Venue" filter label → "Space".
- Any other on-screen "venue" wording (e.g. the admin check-in venue
  picker label).

The `venues` table, the `venueId` columns and identifiers, and
venue-related variable names are **not** changed. (The kiosk route param
is renamed `venueSlug` → `locationSlug` — but that belongs to the Part 1
re-scope, where the parameter genuinely becomes a location; it is not a
cosmetic relabel.)

### Part 3 — Retire the venue slug from PR #116

`venues.slug` becomes unused once the kiosk keys on `locations.slug`.

- Remove the admin "Kiosk URL slug" field from the venue form.
- Remove `slug` from the venues API (Zod schema + GET selects).
- **Keep the `venues.slug` column** in the database and in the Drizzle
  schema as a dormant, unreferenced column. Dropping it is a destructive
  migration with a brief deploy-window race (old code + dropped column →
  errors), against the repo's additive-migration convention. A dormant
  column costs nothing; a future cleanup can drop it.

### Admin: editing a location's slug

The kiosk URL is now `/kiosk/{location.slug}`, so a manager must be able
to set/see a location's slug. `locations.slug` is required, so it is set
at creation — the Locations admin editor must expose it. Verify it does;
add the field if it does not.

## Out of scope

- Full database/code rename of `venues` (table, columns, identifiers).
- Per-space sub-kiosks or a venue picker on the kiosk.
- Any change to how drop-in sessions, games, or field rentals reference a
  venue.

## Testing

- **Re-scoped kiosk** — drive the kiosk for a multi-space facility:
  confirm `/sessions` lists sessions from every space, each labeled with
  its space; walk-in registration completes; "find my booking" searches
  facility-wide. Confirm a single-space facility is unchanged.
- **Backwards compatibility** — a `/kiosk/{location-uuid}` URL still
  resolves; a bad slug shows the "not configured" page.
- **Relabel** — visual check of the admin Spaces tab/forms and the
  `/dropin` filter.

## Rollout

- No migration. `locations.slug` already exists and is populated;
  `venues.slug` is left in place.
- Code-only deploy. The kiosk route path changes, so any externally
  bookmarked `/kiosk/{venue-...}` URL must be re-pointed to the
  `/kiosk/{location-slug}` form — acceptable pre-launch, before kiosks
  are in service.
