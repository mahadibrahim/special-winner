# Super-Admin `/admin` IA — Design

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 1 of 6 in the Admin/Kiosk IA redesign program
**Depends on:** Sub-project 0 (portal nav foundation) — builds on `src/lib/portal/registry.ts`, `PortalLayout`, and the orphan-guard test. Branch is stacked on `docs/portal-ia-foundation`.

## Context

The deep-dive audit found the super-admin sidebar leaves many pages **orphaned**
(reachable by URL but absent from any nav and any contextual link), uses
inconsistent naming, and never populates the notification badges the foundation
can now render. This sub-project gives every page a real nav home, fixes the
naming, and wires up badge counts.

Founder rulings during brainstorming:
- **registrations / teams / games get top-level nav entries** (all-season views),
  not just season-drill-down access. (All three pages are *already* cross-season
  views — only nav entries are missing, so this is nav-config, not page rework.)
- The proposed group structure (Plan&Program / Casual play / Marketing / People /
  Money / Media / Setup / Reports) is approved as-is.

## Goals

1. Every `/admin` page reachable from the sidebar or an intentional contextual link.
2. The orphan-guard whitelist shrinks to only genuinely-contextual sub-pages.
3. Consistent naming.
4. Notification badges (inbox / refundsPending / attention) populated across the
   admin surface without per-page plumbing.

Non-goals: changing page internals (the season-scoped pages already render
cross-season views); coach/media/referee navs (later sub-projects); renaming the
`/admin/dropins` vs `/admin/dropin/*` routes (risk without benefit — leave routes,
keep cross-links coherent).

## Design

### 1. New super-admin nav structure

Rewrite `SUPER_ADMIN_NAV` in `src/lib/admin/nav-super-admin.ts` (which the portal
registry already consumes as the `admin` portal's nav) to:

```
 Home            /admin
 Inbox           /messages              ·badge: inbox

PLAN & PROGRAM
 Venue calendar  /admin/venue
 Seasons         /admin/seasons
 Programs        /admin/programs
 Games           /admin/games            (was orphaned)
 Teams           /admin/teams            (was contextual-only)
 Registrations   /admin/registrations    (was contextual-only)
 Age groups      /admin/age-groups       (was orphaned)
 Game day        /admin/game-day/today   (was orphaned)

CASUAL PLAY
 Drop-ins        /admin/dropins
 Drop League     /admin/drop-league
 Rentals         /admin/rentals
 Memberships     /admin/memberships

MARKETING
 Campaigns       /admin/campaigns
 Broadcasts      /admin/broadcasts            (was orphaned)
 Announcements   /admin/announcements         (orphaned for super-admin)
 Re-registration /admin/re-registration-campaign (was orphaned)

PEOPLE
 Look up         /admin/lookup
 Users & staff   /admin/users

MONEY
 Refunds         /admin/refunds         ·badge: refundsPending
 Payments        /admin/payments
 Discount codes  /admin/discount-codes
 Gear            /admin/gear

MEDIA                                    (new group; whole section was orphaned)
 Shoots          /admin/media/shoots
 Media staff     /admin/media/staff
 Tag queue       /admin/media/tag-queue

SETUP
 Locations & spaces  /admin/locations
 Branding        /admin/branding
 Curriculum      /admin/curriculum
 Compliance      /admin/compliance
 Settings        /admin/settings

REPORTS
 Overview         /admin/reports                  (hub; was bypassed)
 Revenue          /admin/reports/revenue
 Registration trends  /admin/reports/registrations
```

Notes:
- The `Home` item keeps `badgeKey: "attention"`; `Inbox` keeps `badgeKey: "inbox"`;
  `Refunds` keeps `badgeKey: "refundsPending"`. These keys already exist on the
  `NavItem` type and are now populated (section 3).
- The Reports sub-item is labeled **"Registration trends"** to disambiguate from
  the Plan&Program **"Registrations"** management list (different page, same noun).
- Icons: reuse existing lucide imports; pick reasonable ones for the new items
  (Games → `Trophy`/`Flag`, Teams → `Users`/`Shield`, Registrations → `ClipboardList`,
  Game day → `Activity`, Broadcasts → `Radio`/`Megaphone`, Announcements →
  `Megaphone`, Re-registration → `RefreshCw`, Media group → `Camera`/`Image`).
  The plan pins the exact, compile-verified set.

### 2. Naming fixes

- **"Venue calendar"** everywhere for `/admin/venue` — update the venue-manager
  nav's "Venue Day" label to "Venue calendar" too, so the same route has one name.
- **"Locations & spaces"** for `/admin/locations` (was "Locations & venues" while
  the page's tab says "Spaces"). Align the nav label and the page's tab label to
  "Spaces".

### 3. Badge population

Add `GET /api/admin/nav-badges` (admin-gated, org-scoped) returning:

```json
{ "inbox": number, "refundsPending": number, "attention": number }
```

Sources (reuse existing logic; the plan pins exact queries):
- `attention` — `getAttentionFeed(orgId).length` from `src/lib/admin/attention-feed.ts`.
- `refundsPending` — count of `registrations` with `refundStatus = 'pending_approval'`,
  org-scoped.
- `inbox` — count of `conversations` with an unread inbound message, org-scoped
  (the `unreadInbound` signal used by `/api/messaging/conversations`).

**Wiring without per-page plumbing:** `AdminLayout` (the admin wrapper over
`PortalLayout`, `"use client"`) fetches `/api/admin/nav-badges` once on mount
(`useEffect`) and passes the result as the `badges` prop to `PortalLayout`.
`PortalLayout` stays generic and prop-driven (foundation untouched). Non-admin
portals never call the endpoint. Fetch is fail-soft: on error, no badges render
(never block the layout). Counts of 0 render no badge (existing PortalLayout
behavior: `badgeCount ? … : null`).

### 4. Orphan-guard whitelist cleanup

In `tests/unit/portal/route-coverage.test.ts`, remove the now-navigated routes
from `CONTEXTUAL_ROUTES`: `/admin/games`, `/admin/age-groups`,
`/admin/game-day/today`, `/admin/broadcasts`, `/admin/re-registration-campaign`,
`/admin/reports`, `/admin/media/shoots`, `/admin/media/staff`,
`/admin/media/tag-queue`, `/admin/registrations`, `/admin/teams`. Keep
`/admin/sports` contextual (it's a `/admin/programs` tab, reached there). Keep the
genuinely-contextual sub-pages (rate-cards, `/new` forms, redirect stubs). The
test must stay green and stay non-vacuous.

## Components & boundaries

| Unit | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/nav-super-admin.ts` | rewrite `SUPER_ADMIN_NAV` | the admin portal's nav tree |
| `src/lib/admin/nav-venue-manager.ts` | rename "Venue Day" → "Venue calendar" | venue nav label consistency |
| `src/pages/api/admin/nav-badges.ts` | new | aggregate the three counts |
| `src/components/admin/admin-layout.tsx` | add client badge fetch | feed badges to PortalLayout |
| `src/components/admin/locations-*` / locations page | "Spaces" label alignment | naming consistency |
| `tests/unit/portal/route-coverage.test.ts` | shrink whitelist | keep guard honest |
| `tests/unit/admin/nav-super-admin.test.ts` | new | assert every nav route resolves to a real page; orphans present; no dupes |

## Error / edge handling

- nav-badges endpoint: admin-gated (401 for non-admin); org-scoped; returns zeros
  rather than erroring when a source is empty. Client fetch is fail-soft.
- Badge counts are advisory; a stale/failed fetch never blocks navigation.
- Adding nav items for already-global pages requires no data-shape changes; the
  pages already handle "no season selected" (cross-season views / optional
  `seasonId` filter).

## Testing

- Unit: `nav-super-admin.test.ts` — every `SUPER_ADMIN_NAV` href maps to an existing
  `src/pages/admin/**` route (no dead nav links); the previously-orphaned routes
  are present; no duplicate hrefs. Reuse the route-derivation helper from the
  orphan-guard test.
- Unit: nav-badges count logic (pure-ish; mock db) — returns the three keys.
- Unit: orphan-guard still green after whitelist shrink, still non-vacuous.
- `npx tsc --noEmit` clean; build deferred to CI (Node 25).
- Manual (if dev server available): load `/admin` as super-admin, confirm the new
  groups render, badges show when counts > 0, and each orphaned page is reachable
  from the sidebar.
