# Venue-Manager Portal — Design

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 2 of 6 in the Admin/Kiosk IA redesign program
**Depends on:** SP0 (portal foundation: `PortalLayout`, registry, orphan-guard) and SP1 (`getNavBadges`, `/api/admin/nav-badges`, `AdminLayout` badge fetch). Branch stacks on `feat/admin-super-ia`.

## Context

The `location_admin` (venue-manager) portal is deliberately narrow and was
already locked down/audited (PRs #139–#143); the one deferred backlog item (#25:
venue-scoped rosters + reports pages) never shipped. The founder wants the
venue-manager portal made first-class. This sub-project adds four things:

- **A. Badges + nav grouping** — role-aware badge counts for venue managers; group
  labels on the (currently unlabeled) venue sidebar.
- **B. Rosters** — a location-scoped, read-only roster reference page.
- **C. Reports** — a location-scoped, operations-focused (today/this-week) page.
- **D. Casual-play management** — location-scoped drop-in sessions + rentals in
  the venue nav.

Founder rulings: all four in scope; reports focus = **today/this-week operations**;
design approved as-is; build order A→B→C→D (D last, can split to SP2b if it grows).

## Scoping principle (applies to all parts)

Every venue query funnels through the existing location-scope helpers in
`src/lib/auth/location-scope.ts` / `src/lib/admin/active-venue.ts`:

- `getLocationIdsForUser(userId): Promise<string[]>` — the locations a venue
  manager is assigned to.
- For super-admin callers, scoping is a **no-op** (no `locationIds` filter →
  org-wide), so all super-admin behavior is byte-unchanged.
- Venues belong to locations (`venues.locationId`). The chains:
  - drop-in sessions / rentals → `venueId` → `venues.locationId`
  - rosters → `teamId` → `teams.seasonId` → `seasons.programId` →
    `programs.locationId`

## Design

### Part A — Badges + nav grouping

**Role-aware badges.** Generalize `getNavBadges` (from SP1) to accept an optional
scope:

```ts
getNavBadges(orgId: string, scope?: { locationIds: string[]; userId: string }): Promise<NavBadges>
```

- No `scope` (super-admin): org-wide counts (current behavior, unchanged).
- With `scope` (venue manager):
  - `refundsPending` — refund requests for registrations whose
    season→program→location ∈ `scope.locationIds`.
  - `inbox` — unread inbound conversations **assigned to this manager**
    (`assignedStaffId = scope.userId`). (Conversations have no location column;
    "assigned to me" is the correct venue-scoped inbox signal.)
  - `attention` — 0 (the attention feed is a super-admin cross-org view; the
    venue Home is `/admin/venue`, which has no attention badge).

**Endpoint** `/api/admin/nav-badges`: make role-aware. super_admin → `getNavBadges(orgId)`.
location_admin → resolve `getLocationIdsForUser(user.id)` and call
`getNavBadges(orgId, { locationIds, userId: user.id })`. Remove the 403 for
location_admin. (`AdminLayout` already fetches this for both portals — venue
managers will now get real counts instead of a 403.)

**Nav grouping.** Rewrite `VENUE_MANAGER_NAV` with labeled groups and the two new
pages:

```
FRONT DESK   Venue calendar /admin/venue · Check-in /admin/venue/check-in · Walk-up reg /admin/venue/walk-up
CASUAL PLAY  Drop-ins /admin/dropins · Rentals /admin/rentals            (Part D)
PEOPLE       Look up /admin/lookup · Rosters /admin/venue/rosters         (Part B)
COMMS        Inbox /messages ·badge:inbox · Announcements /admin/announcements · Waitlist /admin/waitlist
REQUESTS     Refund requests /admin/refund-requests ·badge:refundsPending
REPORTS      Reports /admin/venue/reports                                  (Part C)
```

### Part B — Venue rosters page

- Page `src/pages/admin/venue/rosters.astro` + `VenueRosters` component +
  `GET /api/admin/venue/rosters`.
- Returns teams (with players) for teams whose season→program→location ∈ the
  caller's locations. Grouped by team; shows player name, status, jersey/notes if
  present.
- **Read-only.** Roster editing remains in the super-admin team-detail surface
  (the `/api/admin/rosters` write path is super-admin-only — do not widen it).
- Empty state when the manager has no teams at their locations yet.

### Part C — Venue reports page

- Page `src/pages/admin/venue/reports.astro` + `VenueReports` component +
  `GET /api/admin/venue/reports?period=today|week`.
- Operations metrics scoped to the caller's locations:
  - **Today:** checked-in headcount, walk-ups taken, drop-in session fill
    (booked vs capacity), no-shows.
  - **This week:** same, aggregated.
- Reuse `src/lib/admin/venue-day-data.ts` aggregation where it already computes
  per-day activity; add a thin week roll-up. No revenue/financials in this page
  (operations focus per founder).

### Part D — Casual-play management (venue-scoped)

- **List endpoints become scope-aware** (additive):
  - `GET /api/admin/dropin/sessions` — when the caller is a non-super admin,
    filter to sessions whose `venue.locationId ∈ getLocationIdsForUser`. Join
    `venues` on `dropInSessions.venueId`.
  - `GET /api/admin/rentals` — same: filter to rentals whose
    `venue.locationId ∈` the caller's locations.
  - super_admin: unchanged (no filter).
- **Nav:** add "Drop-ins" → `/admin/dropins` and "Rentals" → `/admin/rentals` to
  the venue "CASUAL PLAY" group. The pages already render for `location_admin`
  (they use `primaryRole`); they now show only that manager's venue data.
- **Write actions** (create/edit/cancel session, attendance, walk-up, rental
  create/refund) reuse the existing endpoints, which already enforce
  `requireSameOrgVenue`. A follow-up audit confirms a venue manager can only act
  on venues in their locations; if any write endpoint lacks location enforcement
  (only org enforcement), the plan adds a location check. This audit is part of
  Part D.

## Components & boundaries

| Unit | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/nav-badges.ts` | add optional `scope` param | role/location-aware counts |
| `src/pages/api/admin/nav-badges.ts` | role-aware dispatch | super vs venue counts |
| `src/lib/admin/nav-venue-manager.ts` | rewrite with groups + new items | venue nav tree |
| `src/pages/admin/venue/rosters.astro` + component + `api/admin/venue/rosters.ts` | new | scoped roster reference |
| `src/pages/admin/venue/reports.astro` + component + `api/admin/venue/reports.ts` | new | scoped ops reports |
| `src/pages/api/admin/dropin/sessions/index.ts` | add scope filter | venue-scoped session list |
| `src/pages/api/admin/rentals/index.ts` | add scope filter | venue-scoped rental list |
| `tests/unit/admin/nav-venue-manager.test.ts` | new | venue nav links resolve; groups present |
| `tests/unit/portal/route-coverage.test.ts` | whitelist update | new venue pages covered by nav |

## Error / edge handling

- A venue manager with **no assigned locations** → scoped queries return empty;
  pages render empty states; badges are 0. No errors.
- nav-badges stays fail-soft (zeros on error; never 500).
- Scope filters use `inArray(locations.id, locationIds)`; an empty `locationIds`
  array must short-circuit to "no rows" (not "all rows") — explicit guard.
- super-admin paths must remain unfiltered — verified by keeping the filter
  strictly behind a `locationIds != null` branch.

## Testing

- Unit: `nav-venue-manager.test.ts` — every venue nav href resolves to a real
  page (incl. the two new pages); group labels present; no dupes.
- Unit: `getNavBadges` scoped variant — venue scope path returns location-scoped
  refund + assigned-inbox counts (mock db).
- Unit: scope-filter helpers for sessions/rentals — empty `locationIds` →
  zero rows; super-admin (no scope) → unfiltered.
- Unit: orphan-guard stays green + non-vacuous; the two new venue pages are
  covered via nav.
- `npx tsc --noEmit` clean; build deferred to CI (Node 25).
- Manual (if dev server): sign in as a `location_admin` test account, confirm the
  grouped nav, badges, rosters/reports show only their venue data, and drop-ins/
  rentals are venue-scoped; sign in as super_admin and confirm org-wide views
  unchanged.

## Scope guard

If Part D's write-endpoint audit reveals more than a couple of endpoints needing
location enforcement, split D into **SP2b** rather than bloating this plan — the
nav entries + list scoping ship in SP2, the write hardening in SP2b.
