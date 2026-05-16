# Admin overhaul — design spec

**Date:** 2026-05-16
**Status:** Draft, pending founder review
**Predecessor:** `project_admin-overhaul` auto-memory, flagged 2026-05-15

## 1. Problem

The current `/admin` is organized by **schema table** — a flat 32-item sidebar where every Drizzle table gets its own top-level page (Sports / Locations / Venues / Programs / Seasons / Age Groups / Teams / Games / Drop-in Sessions / Drop-in Rate Card / Rentals / Rental Rate Card / …). It forces the operator to know the data model before they can perform a task.

Two specific frictions surfaced this week:

- **Venue vs Location confusion.** The two concepts are distinct in the schema (Location = the property, Venue = a bookable field/court inside it) but appear as peer sidebar items with no hierarchy.
- **Seasons is a leaf, should be a hub.** Today's `/admin/seasons` is a list; the season is actually the connective node where program + age group + venue + schedule + price + registrations all live.

A third constraint surfaced during this brainstorm: **there are two distinct admin personas**, and the current admin collapses them into one undifferentiated wall.

- **Super-admin (the founder).** Multi-venue, strategic, infrequent. Opens new seasons, approves refunds, sets brand and curriculum, looks at cross-venue financials.
- **Venue manager (the location admin).** Single-venue, operational, daily. Runs today's schedule, checks people in, replies to parents, files refund requests, doesn't shape the season ahead and doesn't process money.

The schema already supports this split — `userRoles.roleNameEnum` has `super_admin` and `location_admin`, and `scopeTypeEnum` already includes `location`. The model is in place; the UI doesn't use it.

## 2. Goals

- Reorganize the admin around **workflows** instead of schema tables.
- Give venue managers a purpose-built daily experience that hides the data-model surface entirely (not just disables it).
- Give the super-admin a workflow-shaped home where the **season** is the load-bearing entity.
- Resolve the venue-vs-location confusion at the UI layer.
- Keep all detail screens shared between roles, gated only at the edit-button level.

## 3. Non-goals

- New features. This is a re-organization of existing surfaces. New surfaces (e.g., a future "Coach assignment" workflow) are out of scope.
- Schema changes beyond what role-scoping helpers require. The `location_admin` role and `location` scope already exist.
- Password reset. The misnamed `/forgot-password` is a magic-link login; we'll rename, not re-implement.
- Mobile-first redesign of the admin as a whole. Desktop-first stays for super-admin pages. The Venue Day route specifically does get a tablet-responsive pass (see §5) because that's where the check-in tablet use case lives — but that's the one targeted exception, not a system-wide rework.
- Public-facing site changes.

## 4. Architecture decision — Approach B: two front doors, shared internals

Three approaches were considered:

- **A.** One sidebar with role-gated groups. Rejected: still leaves the venue manager looking at section headers they can't enter.
- **B.** Two front doors, shared detail pages. **Selected.**
- **C.** One sidebar showing all items, forbidden items rendered as locked. Rejected: explicitly re-creates the original "wall of items" complaint behind a tooltip.

### Routing

- `super_admin` → lands on `/admin`. Home is the **Super-admin Home** (§6).
- `location_admin` → lands on `/admin/venue`. Home is the **Venue Day** view, defaulted to today (§5).
- Middleware (`src/middleware.ts`) handles the role-based redirect on every visit to `/admin`. Cross-role URLs return **403, not silent redirect** — we want the boundary to be discoverable.

### Two sidebars, one shell

- `admin-layout.tsx` keeps its current chrome (logo / user / sign-out). The `navigation` array is moved out into `src/lib/admin/nav-super-admin.ts` and `src/lib/admin/nav-venue-manager.ts`. A `getSidebarForRole(role)` helper picks which config to render. No conditionals scattered through JSX.

### Shared detail pages, gated affordances

- Roster views, player profiles, payment records, conversation threads — these are the **same screens** for both roles. Edit / refund / delete buttons render conditionally on role.
- Existing endpoints already enforce row-level org/location ownership via `requireSameOrg*` helpers (per `CLAUDE.md`, "Tenant-scoped admin endpoints"). UI gating is belt-and-suspenders on top of that floor.
- We add `requireSameLocation` alongside the org helpers — same shape, scopes to the location IDs in the user's `userRoles` rows with `scopeType='location'`.

### Scoping for venue managers

- A `location_admin`'s queries auto-filter by their assigned `locationId`(s).
- Reports, lookups, inbox, rosters, waitlist — all scoped to their venue(s).
- No "view all venues" toggle for venue managers.

## 5. Venue manager experience

### Sidebar (10 items, frequency-ordered)

1. **Venue Day** *(home)*
2. **Check-in**
3. **Walk-up reg**
4. **Inbox** (with unread badge)
5. **Look up** (player / parent / coach)
6. **Rosters**
7. **Announcements**
8. **Waitlist**
9. **Reports** (this venue, read-only)
10. **Refund requests** (submit only — they can document and recommend; they cannot process)

The venue name appears once in the sidebar header ("Venue · Downtown"). It does not appear on the date strip or page titles.

### Venue Day route

- New route: `/admin/venue/day/[date]`. `[date]` is `YYYY-MM-DD`.
- `/admin/venue` redirects to `/admin/venue/day/<today>` so the URL is always shareable.
- Date navigation: a **Today** button (jump home), prev/next day arrows, a date picker (date-fns calendar popover), and a **7-day strip** below showing day-of-week + date + activity-density dots per day.
- Past, present, and future dates use the **same layout**. Only the action verbs change:
  - Past: "View attendance"
  - Today: "Check in roster" / "Check in" / "View"
  - Future: "Scheduled" badge, check-in disabled
- No mode switch.

### Activity types (final list)

Each block is color and icon coded:

| Type | Color | Icon |
| --- | --- | --- |
| League game | emerald `#10b981` | ⚽ | League |
| Tournament game | emerald `#10b981` | 🏆 | Tournament |
| Drop-in / pickup | purple `#a855f7` | 🎯 | Drop-in |
| Class | blue `#3b82f6` | 🏫 | Class |
| Camp | blue `#3b82f6` | 🏕 | Camp |
| Rental | amber `#f59e0b` | 🔑 | Rental |
| Free space | diagonal stripe pattern on cream | — | Free |

*(Table columns: Type · Color · Icon · Label)*

Color groups two activity types per family (game vs. instructional) so the day-shape is readable at a glance. Each block carries **three reinforcing cues** — color (family), icon (specific type), and a small uppercase **type label** rendered next to the icon ("Tournament · ⚽", "Camp · 🏕"). The label removes any ambiguity between league and tournament games, and between class and camp, without forcing a second color into the same family.

Free space is **visually muted but not hidden** — it's the operator's signal that a slot is bookable.

Operational warnings render inline on the block (e.g., red "Ref: unassigned" text on a game that needs a ref), not in a separate alerts pane.

### Refund request flow

The existing `registrations.refundStatus` enum already supports `pending_approval`. Venue manager submits a request from a registration detail view; it shows up in the super-admin's "Needs your attention" queue. Venue manager never sees a "process refund" button.

### Reports (venue manager scope)

Read-only stats for their venue: registration count by program/season, attendance, day-of-week patterns, revenue. **No cross-venue totals, no refund metrics, no margin/cost data.**

### Tablet-responsive Venue Day

The check-in use case happens at the front desk on a tablet, not behind a desk on a laptop. The Venue Day view must work at tablet sizes (≥768px, landscape and portrait).

Breakpoint behavior:

- **≥1024px (desktop):** layout as drawn in §5 mockup — sidebar visible, full week strip, time-block list.
- **768–1023px (tablet):** sidebar collapses to icon-only rail (44px wide) with tooltip labels on hover/tap. Date header and week strip stay full-width. Time blocks compress vertically (title + label on one row, metadata on a second, action button right-aligned).
- **<768px (phone):** sidebar becomes a hamburger drawer. Week strip becomes a horizontal scroller showing 4 days at a time. Time blocks stack to full-width cards with the action button below the metadata.

Touch-target minimums: 44×44px for all action buttons, prev/next arrows, and day-strip cells. The "Check in roster" buttons are the highest-frequency touch target — they get extra vertical padding on tablet.

The rest of admin (Season Hub, super-admin home, programs editor, etc.) stays desktop-first. This responsive work is scoped specifically to the Venue Day route and the venue-manager sidebar.

### Live updates on Venue Day

Today's data changes during the day — a parent walks in and checks in, a ref gets reassigned, a drop-in registers. The venue manager should not have to reload the page to see those changes.

**Approach: visibility-gated polling.** The Venue Day page polls its own data endpoint every **15 seconds** *only while the page is visible* (Page Visibility API). When the tab is backgrounded or the screen is locked, polling pauses. When focus returns, it fetches immediately and resumes interval polling.

Why not websockets / SSE:

- The data shape is small (one day's blocks per venue). One refetch per 15s costs trivial bandwidth.
- Stateless polling is dramatically simpler to operate than a persistent connection layer. No connection management, no scaling tier, no reconnect logic.
- The user count is small (1–2 venue managers per venue, tops). There's no scale pressure here.

If the founder ever asks for sub-15s latency or push notifications to mobile, we revisit. For now, polling is the right tool.

Implementation: a `useVenueDayData(date)` React hook owns the polling. It uses `setInterval` with cleanup, tied to `document.visibilityState`. Returns `{ data, isStale, refetch }`. The page surfaces a subtle "updated 12s ago" label so the operator knows the data is fresh.

## 6. Super-admin experience

### Sidebar (~22 items in 6 named groups)

```
Home
Inbox  [unread badge]

— PLAN —
Seasons
Programs               (absorbs old "Sports" + "Age Groups" pages)
Drop-ins               (Sessions tab + Rate card tab)
Rentals                (Bookings tab + Rate card tab)
Campaigns              (rename of "Re-registration campaign")

— PEOPLE —
Look up
Users & staff

— MONEY —
Refunds                [pending-approval badge]
Payments
Discount codes
Gear

— SETUP —
Locations & venues     (consolidated; venues nest inside locations)
Branding
Curriculum
Compliance
Settings

— REPORTS —
Revenue
Registrations
Conversion
```

### Super-admin Home (`/admin`)

Replaces the current 6-card count grid. Three modules, top-to-bottom:

1. **Needs your attention.** Action queue — pending refund requests, unassigned refs for tonight's games, seasons at ≥85% capacity (the point where waitlist comms become relevant), upcoming launch milestones. Top of the page because it drives the day.
2. **Seasons.** Cards for every active season (status pill: *Draft* / *Registration open* / *In season* / *Closed*), with a capacity progress bar, registration count, and key dates. Click → Season Hub.
3. **Today across venues.** Two mini cards (one per venue) showing today's activity blocks, with a deep-link into each venue's Venue Day.

The count cards (Sports / Locations / Programs / etc.) are removed — they're trivia, not signals.

### Season Hub (`/admin/seasons/[id]`)

The season detail page becomes the operator's primary work surface. Header with status + dates + venue + sport, then a **key-facts strip** (Capacity / Revenue / Teams / Games / Waitlist), then **tabs**:

1. Registrations
2. Teams & rosters
3. Schedule
4. Pricing & codes
5. Communications
6. Refunds *(badge if pending)*
7. Settings

Existing screens (`/admin/registrations`, `/admin/teams`, `/admin/games`) become **cross-season read-only summaries** in the sidebar; primary edit flows happen inside the relevant Season Hub.

## 7. Naming & IA cleanup

**Vocabulary**

- *Location* = building / property (Downtown, Worthington). Has address, brand, Google Business Profile.
- *Venue* = bookable resource inside (Field 1, Court A). Hidden in UI for single-resource locations.
- *Game Day* → **Venue Day**. The name "Game Day" is misleading for camps, drop-ins, rentals, and classes.

**Consolidations**

- **Sports** → folded into **Programs** as a filter/grouping. Sport is a categorization, not a daily-driver surface.
- **Age Groups** → tab inside **Programs**. Age groups are program-defining templates (U8 / U10 / Adult Co-Ed) shared across seasons, not season-specific, so they live with Programs.
- **Drop-in Sessions** + **Drop-in Rate Card** → one **Drop-ins** page with two tabs.
- **Rentals** + **Rental Rate Card** → one **Rentals** page with two tabs.
- **Walk-up registration** moves to the **venue-manager** sidebar (it's a front-desk action).
- **Messages** label → **Inbox** (URL stays `/messages` to avoid breakage).
- **Re-registration Campaign** → **Campaigns** (broader bucket).

**While we're in here** (from the project memory's open follow-ups, scoped into this PR)

- Magic-link consumer (`src/pages/m/[token].ts`) currently hardcodes `/dashboard` redirect. Route by role: admin roles → `/admin`, parents/coaches → `/dashboard`.
- Rename `/forgot-password` → `/email-link-signin` (or similar). It's a magic-link login, not a password reset.

**What stays**

- *Compliance*, *Branding*, *Curriculum*, *Settings*, *Reports*, *Gear*, *Discount codes* — all keep their names; just group placement changes.

### Complete rename & redirect inventory

The full pre-build audit. Every change is committed in this PR; no "we'll do this later." Every redirect is a permanent (301) redirect so external links and bookmarks survive.

| Old route | New route | Old label | New label |
| --- | --- | --- | --- |
| `/admin/game-day/today` | `/admin/venue/day/<today>` (venue mgr); deleted for super-admin (use Home's "Today across venues") | Game Day | Venue Day |
| `/admin/sports` and `/admin/sports/*` | `/admin/programs?sport=<id>` (filter) | Sports | (folded into Programs) |
| `/admin/age-groups` | `/admin/programs` (Age Groups tab) | Age Groups | (tab inside Programs) |
| `/admin/dropin/sessions` | `/admin/dropins` (Sessions tab) | Drop-in Sessions | Drop-ins |
| `/admin/dropin/rate-card` | `/admin/dropins` (Rate Card tab) | Drop-in Rate Card | (tab inside Drop-ins) |
| `/admin/rentals` | `/admin/rentals` (Bookings tab) | Rentals | Rentals |
| `/admin/rentals/rate-card` | `/admin/rentals` (Rate Card tab) | Rental Rate Card | (tab inside Rentals) |
| `/admin/teams` (top-level) | `/admin/seasons/<id>#teams` (per-season); top-level becomes a cross-season read-only summary at `/admin/teams` | Teams | Teams (read-only summary) |
| `/admin/games` (top-level) | `/admin/seasons/<id>#schedule` (per-season); top-level becomes a cross-season read-only summary at `/admin/games` | Games | Games (read-only summary) |
| `/admin/walk-up-registration` | `/admin/venue/walk-up` (venue mgr only); deleted from super-admin sidebar | Walk-Up Registration | Walk-up reg |
| `/admin/re-registration-campaign` | `/admin/campaigns` | Re-Registration Campaign | Campaigns |
| `/admin/check-in` | `/admin/venue/check-in` | Check-in | Check-in |
| `/messages` (label only — URL stays) | `/messages` | Messages | Inbox |
| `/forgot-password` | `/email-link-signin` | Forgot password | Sign in with email link |
| `/admin/locations` and `/admin/venues` | one merged page at `/admin/locations`; `/admin/venues` redirects | Locations / Venues (peers) | Locations & venues (nested) |

Routes that **keep both URL and label**: `/admin/seasons`, `/admin/programs`, `/admin/registrations`, `/admin/payments`, `/admin/refunds`, `/admin/discount-codes`, `/admin/gear`, `/admin/users`, `/admin/announcements`, `/admin/waitlist`, `/admin/reports`, `/admin/compliance`, `/admin/branding`, `/admin/curriculum`, `/admin/settings`, `/admin/organizations`.

**Magic-link redirect fix:** `src/pages/m/[token].ts` currently hardcodes `/dashboard`. New logic: after consuming the token, look up the user's role. `super_admin` and `location_admin` redirect to `/admin`; all other roles redirect to `/dashboard` (unchanged behavior). Preserves the existing `?next=` parameter if present (and validates it against an allow-list of internal paths).

## 8. Phasing (implementation order, single PR)

All phases ship in **one PR**. The phase boundaries below are an implementation sequence — they exist so we don't break ourselves mid-build, not so we can ship intermediate states.

### Phase 1 — Role + routing foundation

- `requireSameLocation` helper.
- `getSidebarForRole(role)` + split `nav-super-admin.ts` / `nav-venue-manager.ts`.
- Middleware role-based redirect at `/admin`.
- 403 page for cross-role URLs.
- Magic-link redirect fix.
- `/forgot-password` rename.

### Phase 2 — Venue manager experience

- `/admin/venue/day/[date]` route with date navigation (Today button, prev/next, picker, 7-day strip).
- Activity blocks for the seven types with the color/icon scheme in §5.
- Venue-manager sidebar.
- Scoped versions of inbox, look up, rosters, waitlist, reports.
- Refund-request submit flow.

### Phase 3 — Super-admin experience

- New `/admin` home: Needs your attention → Seasons → Today across venues.
- Super-admin sidebar (6 groups, ~22 items).
- Season Hub at `/admin/seasons/[id]` with tabs.

### Phase 4 — Consolidation & cleanup

- Absorb Sports into Programs (merge pages, permanent redirects from `/admin/sports`).
- Move Age Groups under Programs.
- Merge Drop-in Sessions + Rate Card; same for Rentals.
- Demote/delete the legacy `/admin/teams` and `/admin/games` top-level pages once Season Hub covers them.
- Apply the full rename & redirect inventory from §7.
- **Stale-data audit and cleanup** (see below).

### Stale-data audit (within Phase 4)

The page consolidations may surface orphaned rows that were tolerable when each table had its own page but become noise when those pages collapse together. The cleanup runs *before* the consolidations land so the new merged pages start clean.

The audit queries (run against the prod replica or staging seeded from prod):

1. **Sports with zero programs** — candidates for deletion. Founder approves the list.
2. **Age groups with zero programs referencing them** — candidates for deletion.
3. **Programs with zero seasons** — flag, don't auto-delete (could be intentional "set up but not yet launched"). Founder reviews.
4. **Teams not tied to any season** — flag and review. Could be left over from manual experiments.
5. **Games with no associated season** — should be impossible per the schema, but check anyway.
6. **Drop-in sessions and rate cards orphaned from a location** — flag.
7. **Venues with no parent location** — should be impossible, but check.
8. **`user_organization_access` rows for archived/deleted organizations** — clean up.
9. **`family_members` rows with both `parent_user_id` and `self_user_id` null** — should be impossible per the DB CHECK constraint, but verify the constraint is active.

Output: a markdown table per query showing the offending rows. Founder reviews each list and approves deletion (or marks rows to keep). Deletions go in a single SQL migration file (`NNNN_phase4_stale_data_cleanup.sql`) in the same PR. Each delete is wrapped in `DELETE ... WHERE id IN (...)` with explicit IDs — no broad pattern deletes.

Operates under the existing "additive, forward-compatible schema changes" convention (per `CLAUDE.md` release process); the deletes are content cleanup, not schema changes, and reverse via `git revert` of the migration is harmless (would just re-create the deleted rows from a backup if needed).

## 9. Testing

- **Unit:**
  - `getSidebarForRole(role)` returns the correct nav config per role.
  - `requireSameLocation(user, locationId)` allows/rejects correctly.
  - Date math for the Venue Day route — week-strip generation, today detection, date-range queries.
  - `useVenueDayData` polling hook — interval scheduling, visibility-gated pause/resume, cleanup on unmount.
- **API integration:** existing tests in `tests/api/` continue to pass; add new ones for `requireSameLocation` (venue manager cannot see/edit another location's resources, returns 403).
- **E2E (Playwright):**
  - `super_admin` log-in → lands on `/admin` → sidebar shows 6 groups.
  - `location_admin` log-in → lands on `/admin/venue/day/<today>` → sidebar shows 10 items → cannot navigate to `/admin/seasons/new` (gets 403).
  - Venue Day: today / past / future date all render; activity types render with correct color/icon/label; free space renders striped.
  - Venue Day polling: simulated check-in event from another tab/request appears within 15s without page reload.
  - Tablet viewport (1024×768 landscape): sidebar collapses to icon-rail; touch targets ≥44px on action buttons; week strip remains scannable.
  - Refund submit (venue manager) → appears in super-admin attention queue → super-admin processes.
  - All old URLs from §7 inventory return 301 redirects to the new locations.
- **Manual smoke:** Founder runs both roles end-to-end before merge, including:
  - One full venue manager session on a real tablet at one of the venues.
  - One refund request submitted by venue manager and approved by super-admin.
  - Visual inspection of all four phases' deliverables on prod-like data after the Phase-4 cleanup migration.

## 10. Scope completeness

Nothing is deferred. Every item from the original "open follow-ups" list has been folded into the spec:

- Rename audit → §7 ("Complete rename & redirect inventory").
- Tournament-vs-league visual distinction → §5 activity table (three reinforcing cues: color + icon + text label).
- Stale-data cleanup → §8 ("Stale-data audit (within Phase 4)").
- Tablet-responsive Venue Day → §5 ("Tablet-responsive Venue Day").
- Live updates on Venue Day → §5 ("Live updates on Venue Day", visibility-gated 15s polling).

The implementation plan downstream of this spec covers everything described above. The PR ships when the entire list is done.
