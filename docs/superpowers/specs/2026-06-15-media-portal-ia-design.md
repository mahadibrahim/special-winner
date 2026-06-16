# Media Portal IA — Design

**Date:** 2026-06-15
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 4 of 6 in the Admin/Kiosk IA redesign program
**Depends on:** SP0 (portal foundation: `PortalLayout`, the portal registry, the
orphan-guard route-coverage test) and SP1 (`AdminLayout`'s on-mount badge fetch,
which this mirrors). Independent of SP3 (coach); bases off `main`.

## Context

The media portal serves two roles that do **different** work, and only the
photographer half is wired up:

- **`media_staff`** (photographers) — the shoot workflow: `/media/jobs` (assigned
  shoots, gated to `media_staff` in `src/lib/media/permissions.ts`),
  `/media/jobs/[id]` (shoot detail), `/media/history`. They are notified of
  assignments with `/media/jobs/...` links (`src/lib/media/notifications.ts`).
- **`media_editor`** (taggers) — the tagging workflow: `/media/tag/[session_id]`,
  restricted by `src/lib/media/tag-permissions.ts` to sessions in `tagging`
  state within the editor's **service area** (`mediaStaffProfiles.serviceLocationIds`,
  active profiles only).

All 4 `/media` pages render inside the customer `BaseLayout` (no portal nav). The
registry declares a `media` portal pointing at a flat starter `MEDIA_NAV` (My
jobs + History) and `homeHref: /media/jobs`.

**The gap this fixes:** a `media_editor` has **no way to discover sessions to
tag** — there is no notification to editors and no listing of `tagging`-state
sessions; the only editor surface is a dynamic drill-in (`tag/[session_id]`) with
no entry point. Worse, the portal home `/media/jobs` requires `media_staff`, so a
pure editor lands on a 403. Fixing the editor's entry point is squarely an IA
problem, so it belongs in this sub-project.

## Scoping principle

The two sub-roles see different nav. The registry holds the **full** media nav
(so the orphan-guard covers every page); the layout renders a **role-filtered**
view. A user may hold both roles (sees all items). Editor scoping reuses the
existing service-area model in `tag-permissions.ts`
(`mediaStaffProfiles.serviceLocationIds`).

## Design

### Part A — Role-aware nav (`nav-media.ts`)

New `src/lib/admin/nav-media.ts` (alongside `nav-super-admin`, `nav-venue-manager`,
`nav-coach`) exporting:

- `MEDIA_NAV: NavGroup[]` — the **full** set, used by the registry and the
  orphan-guard:
  ```
  My jobs        /media/jobs    ·badge: (none)
  Tagging queue  /media/queue   ·badge: mediaQueue
  History        /media/history
  ```
- `getMediaNav(roleNames: string[]): NavGroup[]` — the role-filtered view the
  layout renders:
  - `media_staff` → My jobs, History
  - `media_editor` → Tagging queue, History
  - both → all three

The inline starter `MEDIA_NAV` in `registry.ts` is deleted and the registry
imports the full `MEDIA_NAV` from this module.

### Part B — Tagging queue (the new editor entry point)

- New `getTaggingQueue(editorUserId): Promise<TaggingQueueItem[]>` in
  `src/lib/media/get-tagging-queue.ts`: load the editor's active
  `mediaStaffProfiles.serviceLocationIds`; return `shootSessions` in `tagging`
  state whose resolved location (own `locationId`, else the session's venue's
  `locationId`) ∈ that set. Each item carries what the queue list needs (session
  id, a label, location/venue name, when it entered tagging). Inactive/absent
  profile → `[]`.
- New page `src/pages/media/queue.astro` + a `TaggingQueue` component: one row per
  waiting session, linking to `/media/tag/[session_id]`. Empty state when the
  queue is clear.
- Read-only listing; it owns no mutations (tagging happens on the existing tag
  page).

### Part C — Role-aware home

- A `/media` landing (`src/pages/media/index.astro`) redirects server-side:
  `media_staff` → `/media/jobs`; otherwise `media_editor` → `/media/queue`. A user
  with neither media role is sent to `/dashboard` (middleware already gates the
  portal, so this is a safety net). The registry `homeHref` stays `/media/jobs`
  for the portal switcher; the `/media` index handles the per-role redirect.

### Part D — Badge

- Add a `mediaQueue` key to the `NavItem.badgeKey` union and to `PortalBadges`
  (additive — does not affect existing portals).
- `GET /api/media/nav-badges` returns `{ mediaQueue: N }` where N is the editor's
  tagging-queue size — `getTaggingQueue(editorUserId).length` (one source of
  truth with the queue page). Fail-soft: `{ mediaQueue: 0 }` on any error, never
  500. Non-editors get 0.
- The Tagging queue nav item carries `badgeKey: "mediaQueue"`.

### Part E — Chrome migration

- A thin `MediaLayout` (`src/components/media/media-layout.tsx`) mirroring
  `CoachLayout`, with one addition: it takes a `roleNames: string[]` prop (each
  page passes its `locals.userRoles` names) and renders `getMediaNav(roleNames)`
  as the sidebar nav. It fetches `/api/media/nav-badges` on mount (fail-soft).
- Each of the 4 `/media` pages swaps `BaseLayout` → the portal chrome, preserving
  page content. (`tag/[session_id]` already uses `navigation={false} footer={false}`;
  it moves into `MediaLayout` like the rest.)

## Components & boundaries

| Unit | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/nav-media.ts` | new | full `MEDIA_NAV` + `getMediaNav(roles)` |
| `src/lib/portal/registry.ts` | import full `MEDIA_NAV`, drop inline starter | wire real media nav |
| `src/lib/media/get-tagging-queue.ts` | new | editor's tagging queue (service-area scoped) |
| `src/pages/media/queue.astro` + `TaggingQueue` component | new | editor queue page |
| `src/pages/media/index.astro` | new | role-aware `/media` landing redirect |
| `src/components/media/media-layout.tsx` | new | portal chrome + role-aware nav + badge fetch |
| `src/pages/api/media/nav-badges.ts` | new | editor tagging-queue count |
| `src/components/portal/portal-layout.tsx` + `nav-super-admin.ts` | add `mediaQueue` to `PortalBadges` / `NavItem.badgeKey` | badge plumbing |
| `src/pages/media/**` (4 pages) | migrate layout | BaseLayout → portal chrome |
| `tests/unit/admin/nav-media.test.ts` | new | full-nav resolves; `getMediaNav` role filtering; badge |
| `tests/unit/media/get-tagging-queue.test.ts` | new | service-area scoping; empty profile |
| `tests/unit/media/media-nav-badges.test.ts` | new | editor count; 0 for non-editor |
| `tests/unit/portal/route-coverage.test.ts` | whitelist/coverage update | new pages covered |

## Error / edge handling

- An editor with **no active profile / empty service area** → queue is `[]`; badge
  0; page renders the empty state.
- The badge endpoint is fail-soft (`{ mediaQueue: 0 }` on error, never 500).
- A user with **both** roles sees all nav items and lands on `/media/jobs` (staff
  home takes precedence in the redirect).
- A user with **neither** media role never reaches here (middleware gates
  `/media`); the `/media` index redirect to `/dashboard` is a safety net.
- The session→location resolution handles the `locationId`-null/venue-fallback
  case exactly as `tag-permissions.ts` does, so the queue and the per-session
  permission check agree on which sessions an editor may see.
- `/media/queue` and `/media/jobs` remain role-gated by their own page/endpoint
  permission checks; the nav filtering is a UX layer, not the security boundary.

## Testing

- Unit: `nav-media.test.ts` — every `MEDIA_NAV` href resolves to a real page;
  `getMediaNav(["media_staff"])` = jobs+history, `["media_editor"]` = queue+history,
  both = all; Tagging queue carries `badgeKey: "mediaQueue"`.
- Unit: `getTaggingQueue` — returns sessions in tagging state within the editor's
  service area; `[]` for an inactive/absent profile (mock db).
- Unit: `media-nav-badges` — editor count from the queue; 0 for a non-editor / on
  error.
- Unit: orphan-guard stays green and non-vacuous — `/media/queue` and `/media`
  are covered (queue via nav; the index is a redirect stub, auto-skipped);
  `jobs/[id]`, `tag/[session_id]` are dynamic (auto-skipped).
- `npx tsc --noEmit` clean; build deferred to CI.
- Manual (if dev server): sign in as `media_editor` → land on the Tagging queue,
  see waiting sessions, drill into one; sign in as `media_staff` → land on My
  jobs; confirm super-admin/venue/coach portals unchanged.

## Scope guard

If the tagging-queue location resolution (the `locationId`-null → venue fallback)
turns out to need more than a straightforward join — e.g. multi-venue sessions or
a data-quality cleanup — split the queue's location handling to **SP4b** and ship
the queue for the common (`locationId` present) case first, rather than bloating
this plan.

## Non-goals

- No changes to the shoot or tagging workflow logic (capture, upload, tag CRUD,
  state transitions are unchanged).
- No editor notifications (a separate enhancement; the queue replaces the missing
  entry point for now).
- Referee portal (SP5).
