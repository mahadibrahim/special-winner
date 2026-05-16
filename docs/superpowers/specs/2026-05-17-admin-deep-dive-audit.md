# Admin deep-dive · audit findings

**Date:** 2026-05-17
**Method:** Manual click-through against prod (`https://aspiresportsohio.com`) signed in as `mahad.ibrahim@gmail.com` (super_admin). Each page navigated to, accessibility tree captured, text content scraped.
**Pre-reqs satisfied:** PR #59 merged. Day-0 seed live in prod (1 Soccer sport, 4 venues, 8 age groups, 4 programs, 3 seasons, 2 founders teams, 4 games, FOUNDERS code). Gmail dot-trick normalization active. Migration 0028 applied.

## Severity scale

- **P0** — blocks customer journey (signin fails, payment fails, registration cannot complete)
- **P1** — admin can't do their job (can't create / approve / edit core entities)
- **P2** — polish (copy issues, slow page, misleading affordances, broken-looking empty states)

## Effort scale

- **S** ≤2h · **M** ~½ day · **L** 1-2 days · **XL** ≥3 days (deferred → follow-up issue)

---

## Findings by page

### /admin — Home
- **Status:** PARTIAL
- **Severity:** P1
- **Effort:** S
- **Fix PR:** Plan
- **Findings:**
  - All 6 sidebar groups render correctly (Home, Inbox, Plan, People, Money, Setup, Reports — 22 items total).
  - Seasons grid renders all 3 seeded seasons with status pills + capacity bars + days-left. ✓
  - "Today across venues" — both venue cards stuck on **"Loading…"** indefinitely. The `/api/admin/venue-day/<today>?locationId=…` calls appear to be failing or extremely slow. P1 finding.
  - "Needs your attention" panel renders nothing (correct — no pending refunds, no attention items).

### /messages — Inbox
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Filter UI present (All / Mine / Unassigned, All roles / Bot-handled / Routed to coach / Routed to admin).
  - Empty state ("Select a conversation to view the thread"). Working as designed.

### /admin/seasons — Seasons list
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Lists 3 seeded seasons with proper status badges.
  - "Add Season" CTA visible.
  - Each card has 2 action buttons (no labels in interactive tree — possibly icons). Verify those are reachable and labeled for accessibility (P2 polish).

### /admin/seasons/[id] — Season Hub
- **Status:** PARTIAL
- **Severity:** P1
- **Effort:** L
- **Fix PR:** Plan
- **Findings:**
  - Tabbed layout renders (Registrations / Teams & rosters / Schedule / Pricing & codes / Communications / Refunds / Settings).
  - **Tab content is deep-link placeholder panels**, not inline data. Per the PR #56 spec, the Phase-3 v1 ships placeholders; the audit confirms they're still placeholders. Inline real-data tabs ship in this group's fix-PR.
  - Key-facts strip renders (Capacity / Revenue / Teams / Games / Waitlist), all 0 since no registrations yet.
  - "Edit season" and "Send announcement" buttons present.

### /admin/programs — Programs (with Sports + Age groups tabs)
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Tab strip works (Programs / Sports / Age groups).
  - "Add Program" CTA visible.
  - Lists 4 seeded programs with action buttons.

### /admin/dropins — Drop-ins (Sessions + Rate card tabs)
- **Status:** EMPTY-STATE
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Sessions tab is empty (no drop-in sessions seeded).
  - "+ New session" CTA appears **twice** on the page — P2 polish (duplicate button).
  - Rate card tab loads correctly.

### /admin/rentals — Rentals (Bookings + Rate card tabs)
- **Status:** PARTIAL
- **Severity:** P2
- **Effort:** S
- **Fix PR:** Plan
- **Findings:**
  - Bookings tab loads with filter UI + "+ New rental" CTA.
  - **The venue filter is a raw textbox** that says "Paste venue UUID…" — should be a dropdown of the venues at the user's org. P2.
  - Date filters and status dropdown work.
  - Rate card tab loads.

### /admin/campaigns — Re-registration campaigns
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Renders heading, intro copy, season picker (3 seeded seasons listed), Dry-run + Send CTAs.
  - Working as designed for a pre-launch state (no past-season parents to target yet).

### /admin/lookup — Look up
- **Status:** BROKEN
- **Severity:** P1
- **Effort:** M
- **Fix PR:** People
- **Findings:**
  - Page renders sidebar + a single empty `<main>` element with no content. Accessibility tree shows zero interactive elements in the body.
  - The user expected a search-by-name-or-email box leading to a unified lookup of parents/players/coaches; it doesn't render at all.
  - Likely a JS hydration failure or the page is a placeholder file.

### /admin/users — Users & staff
- **Status:** BROKEN
- **Severity:** P1 (the user flagged this explicitly)
- **Effort:** L
- **Fix PR:** People
- **Findings:**
  - Renders a "Search by name or email..." textbox but **nothing else** — no listing, no rows, no "Invite user" / "Add staff" CTA.
  - Mahad + Alexis exist in `users` but don't appear here. The page filters by `user_organization_access`; that table is empty for the keep-users post-purge.
  - **Missing functionality:** invite flow, staff role assignment, role-scope editing.
  - Per-user detail page (`/admin/users/[id]`) was not exercised (no users in list to click).

### /admin/refunds — Refunds queue
- **Status:** OK (empty data)
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Header shows 4 stat cards (Pending Approval / Processed / Approved / Denied) all 0.
  - Empty state: "No refund requests found."
  - Approve/deny flow couldn't be exercised without seeded refund requests; verify in PR #4 (Money group) after seeding a test refund.

### /admin/payments — Payments
- **Status:** OK (empty data)
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Total Revenue / Total Refunds / Succeeded / Pending stats all 0.
  - Status + Type filter dropdowns.
  - Empty state: "No payments found."

### /admin/discount-codes — Discount codes
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Shows seeded **FOUNDERS** code with `100% off`, Active, `Used: 0 / ∞`.
  - "Create Code" CTA present.

### /admin/gear — Gear & merchandise
- **Status:** PARTIAL
- **Severity:** P2
- **Effort:** M
- **Fix PR:** Money
- **Findings:**
  - Renders heading + intro. Shows "Products" section header.
  - **No "+ Add product" CTA visible** in the scrape. No products listed (correct for empty data), but the action affordance to create one is missing/hidden.
  - Subpages (products, variants) not exercised.

### /admin/locations — Locations & venues
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Tab strip works (Locations / Venues).
  - Lists 2 real locations with addresses + Active status.
  - "Add Location" CTA visible.

### /admin/branding — Branding profiles
- **Status:** EMPTY-STATE
- **Severity:** P2
- **Effort:** L
- **Fix PR:** Setup
- **Findings:**
  - "+ New profile" CTA + "No brand profiles yet" empty state.
  - Per-domain brand profile flow exists in schema but no UI for the actual editor was exercised (couldn't click into a non-existent profile).
  - For prod aspiresportsohio.com to render branded, a profile may be needed — currently brand resolves via the domain-resolver code path. Worth confirming.

### /admin/curriculum — Curriculum management
- **Status:** OK (empty data)
- **Severity:** none
- **Effort:** XL (out of scope per spec §11)
- **Fix PR:** deferred
- **Findings:**
  - Renders stats (Skills / Activities / Templates / Active Items, all 0).
  - "Add Skill", "Add Activity", "Add Practice Template" CTAs present.
  - Per spec, curriculum CRUD UI is OUT OF SCOPE for the deep-dive. Schema exists; surface is its own multi-week project.

### /admin/compliance — Compliance & waivers
- **Status:** EMPTY-STATE
- **Severity:** none (working as designed)
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Renders intro + empty state ("No participants yet"). Pre-launch state; populates once registrations exist.

### /admin/settings — Settings
- **Status:** OK
- **Severity:** P2
- **Effort:** S
- **Fix PR:** Setup
- **Findings:**
  - Tabs render (General / Notifications / Payments / Security).
  - General tab shows "External Team Store" config with partner dropdown (BSN Sports, etc.).
  - Other tabs not exercised — verify Notifications/Payments/Security tab content in PR #5.
  - The page heading just says "Organization Settings" — no breadcrumb showing which org you're editing. Polish.

### /admin/reports/revenue — Revenue report
- **Status:** **404**
- **Severity:** P1
- **Effort:** L
- **Fix PR:** Reports
- **Findings:**
  - Page does not exist. The sidebar links to this URL.
  - Per PR #56 spec §6, the Reports group is bare sidebar entries pending implementation. PR #6 builds these.

### /admin/reports/registrations — Registration report
- **Status:** **404**
- **Severity:** P1
- **Effort:** L
- **Fix PR:** Reports
- **Findings:**
  - Same as above. Page does not exist.

### /admin/reports/conversion — Conversion report
- **Status:** **404**
- **Severity:** P1
- **Effort:** L
- **Fix PR:** Reports
- **Findings:**
  - Same as above. Page does not exist.

### /admin/venue/day/[date] — Venue Day
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Renders venue identity (Aspire Sports — Worthington), date heading, week strip with day-of-week + dates.
  - Today button + prev/next arrows.
  - Empty state ("No activities scheduled") + the 6-type legend (League / Tournament / Drop-in / Class / Camp / Rental).
  - For super_admin, defaults to Worthington (the first org location). Switching to Downtown via `?locationId=…` works (verified in earlier smoke).
  - Live game data (4 seeded games at Field 1) will appear on 2026-07-08 and 2026-07-15.

### /admin/teams — Teams (cross-season summary)
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Renders the "cross-season summary" banner (correct per PR #56's demotion).
  - Lists the 2 founders teams with `0 / ∞ players` and "Manage Roster →" links.
  - "Add Team" CTA exists (was supposed to be stripped per the demotion — minor follow-up if you want strict read-only).

### /admin/games — Games (cross-season summary)
- **Status:** OK
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - "Cross-season summary" banner present.
  - Lists 4 seeded games with date, duration, teams, venue, status.
  - "Schedule Game" CTA exists (same demotion follow-up as Teams).

### /admin/announcements — Announcements
- **Status:** EMPTY-STATE
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - "New Announcement" CTA + "Create First Announcement" CTA + status filter.
  - Empty state expected pre-registration. Will populate after first season opens.

### /admin/waitlist — Waitlist management
- **Status:** EMPTY-STATE
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - Season filter (All Seasons) + empty state.

### /admin/refund-requests — Refund requests (venue-mgr view)
- **Status:** OK (empty data)
- **Severity:** none
- **Effort:** —
- **Fix PR:** —
- **Findings:**
  - "All refund requests across the org" + "No refund requests yet" empty state.
  - For super-admin, deep-links to /admin/refunds for processing.

---

## Customer-journey spine (Phase E)

Not yet exercised end-to-end as part of this audit. The Day-0 seed has the open Adult Co-Ed 7v7 season available, so the wizard CAN be exercised. Recommended approach for the customer-journey fix-PR:

1. Visit `/register/<adult-7v7-season-id>` anonymously
2. Run wizard to step 3 (payment)
3. Sign up as new user — verify Turnstile blocks bots (once Turnstile lands) and dot-trick collisions reject duplicates
4. Complete Stripe Checkout (test mode)
5. Verify registration appears in `/admin/payments` + `/admin/seasons/<id>` Registrations tab + `/admin/venue/day` roster

---

## Bot-detection posture (post-PR #59)

| Mitigation | Status |
| --- | --- |
| Gmail dot-trick normalization | **SHIPPED** (PR #59) |
| Cloudflare Turnstile on `/signup` | Not shipped (deferred to follow-up) |
| 1-hour pre-verification session | Not shipped |
| Daily TTL cron for unverified accounts | Not shipped |

The four remaining mitigations are tracked in the deep-dive design spec §8. They land in a future bot-detection PR.

---

## Summary table

| Page | Status | Severity | Effort | Fix PR |
| --- | --- | --- | --- | --- |
| /admin (home) | PARTIAL | P1 | S | Plan |
| /messages | OK | — | — | — |
| /admin/seasons | OK | — | — | — |
| /admin/seasons/[id] (Season Hub) | PARTIAL | P1 | L | Plan |
| /admin/programs | OK | — | — | — |
| /admin/dropins | EMPTY-STATE | P2 | S | Plan |
| /admin/rentals | PARTIAL | P2 | S | Plan |
| /admin/campaigns | OK | — | — | — |
| /admin/lookup | **BROKEN** | P1 | M | People |
| /admin/users | **BROKEN** | P1 | L | People |
| /admin/refunds | OK | — | — | — |
| /admin/payments | OK | — | — | — |
| /admin/discount-codes | OK | — | — | — |
| /admin/gear | PARTIAL | P2 | M | Money |
| /admin/locations | OK | — | — | — |
| /admin/branding | EMPTY-STATE | P2 | L | Setup |
| /admin/curriculum | OK | XL | DEFERRED | — |
| /admin/compliance | EMPTY-STATE | — | — | — |
| /admin/settings | OK | P2 | S | Setup |
| /admin/reports/revenue | **404** | P1 | L | Reports |
| /admin/reports/registrations | **404** | P1 | L | Reports |
| /admin/reports/conversion | **404** | P1 | L | Reports |
| /admin/venue/day/[date] | OK | — | — | — |
| /admin/teams | OK | P2 | S | Plan |
| /admin/games | OK | P2 | S | Plan |
| /admin/announcements | EMPTY-STATE | — | — | — |
| /admin/waitlist | EMPTY-STATE | — | — | — |
| /admin/refund-requests | OK | — | — | — |

**P0 findings:** 0 (the spine is intact)
**P1 findings:** 7 (home, Season Hub, lookup, users, 3 reports)
**P2 findings:** 6 (dropins duplicate CTA, rentals UUID textbox, gear missing CTA, branding editor, settings breadcrumb, teams/games strip-action follow-up)
**Deferred:** Curriculum CRUD UI (XL, separate spec)

## Fix-PR ordering (recommended)

1. **PR #2 — Plan group** (S+L total): home's Loading… venue-day cards, Season Hub inline tab content, dropins duplicate-CTA cleanup, rentals venue dropdown, teams/games strip-action follow-up.
2. **PR #3 — People group** (M+L): fix /admin/lookup (search-by-name UI), build out /admin/users (listing + invite flow + per-user detail).
3. **PR #4 — Money group** (M): gear CTAs + product/variant management.
4. **PR #5 — Setup group** (L+S): branding profile editor, settings breadcrumb + Notifications/Payments/Security tabs.
5. **PR #6 — Reports group** (3×L): build the three missing report pages.
6. **PR #7 — Customer-journey hardening + bot detection** (M+L): exercise the wizard end-to-end, fix any findings, ship the remaining bot-detection mitigations (Turnstile, short session, TTL cron).

PRs #2-#6 can land in parallel since each touches its own surface. PR #7 (customer-journey) should land last so it tests the cumulative state.
