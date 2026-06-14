# Portal Nav Foundation — Design

**Date:** 2026-06-14
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 0 of 6 in the Admin/Kiosk IA redesign program

## Context

A deep dive on the staff-facing interfaces found they are out of sync with each
other and with the backend. The work was decomposed into six sub-projects:

0. **Nav foundation** (this spec) — the shared role-scoped nav spine.
1. Super-admin `/admin` IA — surface orphans, fix naming, re-group.
2. Venue-manager (`location_admin`) IA — first-class, venue-scoped surface.
3. Coach portal IA.
4. Media portal IA.
5. Referee portal (greenfield) — refs report on assigned matches.

Build order: 0 → 1 → 2 → 5 → 3 → 4. Each later sub-project adopts this
foundation and gets its own spec → plan → build cycle.

### Why a foundation is needed (current state)

- Only `/admin` has a real portal layout (`AdminLayout`, navy sidebar driven by
  `getSidebarForRole`). **`/coach` and `/media` render inside `BaseLayout`** —
  the *customer-facing* top nav. Coaches and media workers have no portal nav.
- Nav is hand-maintained per role in scattered files
  (`src/lib/admin/nav-super-admin.ts`, `nav-venue-manager.ts`); coach/media have
  none.
- `AdminLayout` defines `badgeKey` on nav items but **never renders a badge**
  (typed-but-dead).
- Many `/admin` pages are reachable by URL but absent from any nav and any
  contextual link — genuinely orphaned (e.g. `/admin/games`, the entire
  `/admin/media/**` management section, `/admin/age-groups`,
  `/admin/game-day/today`, `/admin/broadcasts`, `/admin/re-registration-campaign`,
  `/admin/reports` hub).
- The `referee` role exists in the enum but has no route, no middleware rule, and
  no portal.

## Goals

1. One shared, role-scoped portal layout consumed by all five portals.
2. A single nav registry replacing the scattered/missing per-role nav files.
3. Render the badges that are currently typed-but-dead.
4. A portal landing hub for multi-role users.
5. A permanent, enforced guarantee against orphaned pages.

Non-goals (deferred to later sub-projects): migrating `/coach` and `/media`
pages off `BaseLayout`; fixing nav *content* and naming (dropins↔dropin, "Venue
calendar"↔"Venue Day", locations↔spaces); building referee pages.

## Design

### 1. Portal model

A `Portal` is the unit of role-scoped navigation, defined in one registry at
`src/lib/portal/registry.ts`:

```ts
type Portal = {
  id: "admin" | "venue" | "coach" | "media" | "referee";
  label: string;        // shown on the hub card and sidebar subtitle
  basePath: string;     // route prefix
  homeHref: string;     // where the portal opens
  roles: RoleName[];    // roles that grant access to this portal
  nav: NavGroup[];      // the sidebar config
};
```

| Portal id | Granting role            | Base path  | Home            |
|-----------|--------------------------|------------|-----------------|
| `admin`   | `super_admin`            | `/admin`   | `/admin`        |
| `venue`   | `location_admin`         | `/admin`   | `/admin/venue`  |
| `coach`   | `coach`                  | `/coach`   | `/coach`        |
| `media`   | `media_staff`, `media_editor` | `/media` | `/media/jobs` |
| `referee` | `referee`                | `/referee` | `/referee`      |

**`admin` and `venue` are deliberately two distinct portals**, not one portal
with role-variant nav. Rationale (founder-confirmed): the admin portal covers
the entire business across all venues; the venue-manager portal is scoped to
only that manager's venue(s). They share the `/admin` route prefix but differ in
nav, home, and data scope.

`NavGroup` / `NavItem` types move from `nav-super-admin.ts` into the portal lib;
`badgeKey` stays on `NavItem`. The existing `SUPER_ADMIN_NAV` and
`VENUE_MANAGER_NAV` become the `nav` of the `admin` and `venue` portals
respectively (content unchanged in this sub-project). `coach` and `media` get
**starter** nav (enough for the hub to link in and the portal to be navigable);
their full content is Sub-projects 3 & 4. `referee` nav is a placeholder until
Sub-project 5.

### 2. Resolution helpers (`src/lib/portal/resolve.ts`)

- `resolvePortalsForUser(roles: string[]): Portal[]` — every portal whose
  `roles` intersect the user's roles. A super_admin who is also a coach gets
  both `admin` and `coach`.
- `resolvePostLoginTarget(roles: string[]): string` —
  - 0 portals → `/dashboard`
  - exactly 1 portal → that portal's `homeHref`
  - >1 portals → `/portal` (the hub)
- `getPortalById(id)` / nav lookup helpers.

### 3. `PortalLayout` primitive

`src/components/portal/portal-layout.tsx`, generalized from the existing
`AdminLayout`. Same navy sidebar, mobile drawer, tablet icon-rail, user footer,
sign-out — that design stays. Changes:

- Driven by a passed-in `Portal` (or its `nav` + metadata) instead of
  `getSidebarForRole(role)`.
- **Render badges.** New `badges?: { inbox?: number; refundsPending?: number;
  attention?: number }` prop; a `NavItem` with `badgeKey` shows the count.
- **Shared active-state** helper (extract the `currentPath` matching, including
  the `/admin` exact-match edge case, into one tested function).
- **Breadcrumb slot**: optional `breadcrumbs?: { label: string; href?: string }[]`
  rendered in the top bar.
- **"Switch portal"** link in the user footer, shown only when
  `resolvePortalsForUser` returns >1 portal → links to `/portal`. Explicit link,
  no dropdown/mode/hidden state.

`AdminLayout` is replaced by `PortalLayout` (admin `.astro` pages import
`PortalLayout` and pass the resolved portal). Where churn matters, a thin
`AdminLayout`-compatible wrapper may be kept temporarily, but the target is
direct `PortalLayout` use.

### 4. Portal landing hub

New route `src/pages/portal/index.astro` — a clean, centered card layout (NOT a
portal sidebar; the hub sits above portals). Behavior via
`resolvePortalsForUser`:

- 0 portals → redirect `/dashboard`.
- 1 portal → 301 to that portal's `homeHref` (no hub flash).
- >1 portals → render one card per accessible portal (label + icon + link to
  `homeHref`).

Post-login routing: the client signin handler already receives `roles` from
`signin.ts` (the endpoint returns `roles` in its JSON). It calls
`resolvePostLoginTarget(roles)` for the redirect. The existing `/admin` index
super-admin-vs-venue redirect also defers to the resolver so there is one source
of truth for "where does this user belong."

### 5. Orphan-guard test

`tests/unit/portal-route-coverage.test.ts` — pure Vitest unit test, no server or
DB. It globs `src/pages/{admin,coach,media,referee}/**/*.astro`, derives the
route for each file, and asserts every route is one of:

1. present in some portal's `nav`, OR
2. a dynamic/detail route (path contains `[id]`, `[date]`, `[token]`, etc.), OR
3. a redirect stub (file body is a single `Astro.redirect(...)`), OR
4. listed in an explicit `CONTEXTUAL_ROUTES` whitelist (routes intentionally
   reached only via contextual links, e.g. `/admin/registrations` and
   `/admin/teams` reached from the season-detail page, `/admin/sports` reached
   from the programs list).

The test fails CI if any route falls through. This is the permanent guarantee.
The current orphans are triaged into nav-or-whitelist as Sub-projects 1–4 land;
to keep this sub-project green, the orphans that aren't yet placed are added to
`CONTEXTUAL_ROUTES` with a `// TODO(sub-project N)` note so the test passes now
and the TODO marks the debt.

### 6. Scope boundary

**In scope (this sub-project):**
- `src/lib/portal/registry.ts`, `resolve.ts` (+ types moved in).
- `src/components/portal/portal-layout.tsx` (+ shared active-state helper).
- `src/pages/portal/index.astro` (hub) + `resolvePostLoginTarget` wiring in the
  signin handler and `/admin` index.
- `tests/unit/portal-route-coverage.test.ts`.
- Migrate `/admin` (admin + venue portals) onto `PortalLayout` as the proof.

**Deferred:**
- Migrating `/coach` and `/media` pages off `BaseLayout` (Sub-projects 3 & 4).
  The registry holds starter nav so the hub links work; their pages keep current
  chrome until then.
- Nav content/naming fixes (Sub-project 1).
- Referee pages and middleware rule (Sub-project 5).

## Components & boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `lib/portal/registry.ts` | Static portal definitions + nav configs | nav types, lucide icons |
| `lib/portal/resolve.ts` | Role→portal resolution, post-login target | registry |
| `components/portal/portal-layout.tsx` | Render the role-scoped chrome | a portal config + badges + breadcrumbs |
| `lib/portal/active-state.ts` | currentPath → active nav item | none (pure) |
| `pages/portal/index.astro` | Hub / redirect | resolve |
| `tests/unit/portal-route-coverage.test.ts` | Orphan guard | registry, fs glob |

Each is independently testable: `active-state` and `resolve` are pure functions
with unit tests; the layout is a presentational component fed a config; the route
coverage test reads the registry and filesystem.

## Error / edge handling

- User with a role not mapped to any portal (e.g. `parent`, `player`) →
  `resolvePortalsForUser` returns `[]` → hub redirects to `/dashboard`.
- User with `super_admin` + `location_admin` → both `admin` and `venue` portals
  appear on the hub (super_admin is not auto-collapsed into venue).
- Middleware access rules are unchanged in this sub-project; the hub only routes
  to portals the user can actually reach. (Referee middleware rule lands in
  Sub-project 5; until then the `referee` portal card is hidden because no user
  is routed there and the page does not exist.)

## Testing

- Unit: `resolve` (each portal-count branch), `active-state` (exact `/admin`
  match, prefix matches, nested routes), route-coverage guard.
- Build: `npm run build` to catch SSR/prerender issues on the new hub page.
- Type: `npx tsc --noEmit` clean.
- Manual: log in as a single-role user (straight to portal), a multi-role user
  (hub), and a customer (→ dashboard); confirm badges render on the admin
  sidebar (inbox / refunds-pending / attention).
