# Coach Portal IA — Design

**Date:** 2026-06-15
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 3 of 6 in the Admin/Kiosk IA redesign program
**Depends on:** SP0 (portal foundation: `PortalLayout`, the portal registry, the
orphan-guard route-coverage test) and SP1 (`getNavBadges` + the `AdminLayout`
on-mount badge fetch, which this mirrors). No dependency on SP2.

## Context

Coaches are the only portal role still rendering inside the customer-facing
`BaseLayout` — all 12 `src/pages/coach/**` pages use it, so a coach gets the
public top nav and no portal sidebar. The portal registry already declares a
`coach` portal (`basePath: /coach`, `roles: ["coach"]`) but points it at a flat
**starter** `COACH_NAV` defined inline in `src/lib/portal/registry.ts`. SP3
makes the coach portal first-class, the same way SP2 did for venue managers.

**Audience.** Coaches are a youth-program role; adult leagues run on captains,
not coaches. The IA is designed for youth coaches (head **and** assistant) and
does not try to serve adult-league cases.

**Coach pages today** (all on `BaseLayout`):

- Global: `index` (dashboard home), `schedule`, `standings`, `messages` (inbox),
  `resources`, `assessments` (list), `practices/{index,new,[id]}`
- Team-scoped: `roster/[teamId]`, `attendance/[teamId]`
- Player-scoped: `assess/[playerId]` (drill-in from a roster)

## Scoping principle

A coach's roster, attendance, and per-player assessment are all **team-scoped**;
schedule, standings, resources, and messages are not. The nav is **hybrid**:
team-scoped work funnels through a "My Teams" hub, global tools stay flat. Team
membership is resolved from `teams.coachUserId` / `teams.assistantCoachUserId`
(the pattern already used for coach scoping in `src/lib/auth/roles.ts`).

## Design

### Part A — `nav-coach.ts` (grouped coach nav)

New `src/lib/admin/nav-coach.ts` exporting `COACH_NAV: NavGroup[]` (the
`NavGroup` type from `nav-super-admin.ts`, same shape as `VENUE_MANAGER_NAV`).
The inline starter `COACH_NAV` in `registry.ts` is deleted and the registry
imports this instead.

```
Home          /coach                       (dashboard)
TEAMS
  My Teams    /coach/teams      (NEW)       → roster / attendance / assess per team
COACHING
  Practices   /coach/practices
  Assessments /coach/assessments
  Resources   /coach/resources
SEASON
  Schedule    /coach/schedule
  Standings   /coach/standings
COMMS
  Messages    /coach/messages   ·badge: unread
```

The team-scoped pages (`roster/[teamId]`, `attendance/[teamId]`) and the
player-scoped `assess/[playerId]` are intentionally **not** top-level nav items —
they are reached from My Teams, and are whitelisted in the orphan-guard as
drill-in routes (Part E).

### Part B — My Teams hub (the one new page)

- New `getCoachTeams(userId): Promise<CoachTeam[]>` in
  `src/lib/coach/get-coach-teams.ts`: teams where the user is head **or**
  assistant coach, with the fields the hub needs (team name, season/program
  label, player count).
- New page `src/pages/coach/teams.astro` + a `CoachTeams` component rendering one
  card per team, each linking to that team's `roster/[teamId]` and
  `attendance/[teamId]` (and assessments scoped to the team where applicable).
- Empty state when the coach has no team assignments yet.
- Read-only listing; it owns no mutations.

### Part C — Unread-messages badge

- The coach inbox is scoped by **team membership** (a coach sees conversations
  whose parent has a kid on one of their teams), already enforced in
  `src/pages/api/messaging/conversations/index.ts`. This is a different scope
  from the venue inbox (`assignedStaffId`), so the count is a coach-specific
  variant, not the existing `getNavBadges` scoped path.
- Add a coach badge count (unread conversations in the coach's scoped inbox)
  served by a dedicated `GET /api/coach/nav-badges` route, kept separate from the
  admin route so the two scopings don't entangle. It reuses the coach-inbox
  scoping from the conversations list endpoint. Fail-soft: 0 on error, never 500.
- `nav-coach.ts`'s Messages item carries `badgeKey: "inbox"`; the count flows
  through the existing `PortalBadges` → `PortalLayout` badge rendering.

### Part D — Layout migration

- A thin `CoachLayout` (mirroring `src/components/admin/admin-layout.tsx`) wraps
  `PortalLayout`, passes `COACH_NAV`, and fetches the coach badge count on mount
  (same fail-soft pattern as `AdminLayout`).
- Each of the 12 `src/pages/coach/**` pages swaps `BaseLayout` → the coach portal
  layout, preserving its existing page content (the dashboard, tables, forms are
  unchanged — only the chrome changes). The customer top-nav assumptions are
  dropped.

## Components & boundaries

| Unit | Change | Responsibility |
|------|--------|----------------|
| `src/lib/admin/nav-coach.ts` | new | coach nav tree (`NavGroup[]`) |
| `src/lib/portal/registry.ts` | import `COACH_NAV`, drop inline starter | wire real coach nav |
| `src/lib/coach/get-coach-teams.ts` | new | a coach's teams (head or assistant) |
| `src/pages/coach/teams.astro` + `CoachTeams` component | new | My Teams hub |
| `src/components/coach/coach-layout` (CoachLayout) | new | portal chrome + badge fetch |
| `src/pages/api/coach/nav-badges.ts` | new | unread-inbox count (team-scoped) |
| `src/pages/coach/**` (12 pages) | migrate layout | BaseLayout → portal layout |
| `tests/unit/portal/route-coverage.test.ts` | whitelist update | cover coach pages + drill-ins |
| `tests/unit/admin/nav-coach.test.ts` | new | hrefs resolve; groups present; Messages badge |
| coach badge unit test | new | team-scoped unread count |

## Error / edge handling

- A coach with **no team assignments** → My Teams renders an empty state; badge
  is 0; no errors.
- The badge endpoint is fail-soft (0 on error, never 500), matching `AdminLayout`.
- Assistant-only coaches are treated identically to head coaches for nav, hub,
  and badge (membership = head OR assistant).
- Drill-in routes (`roster/[teamId]`, `attendance/[teamId]`, `assess/[playerId]`)
  have no top-level nav home by design — the orphan-guard whitelists them as
  reached-from-My-Teams, so the coverage test stays non-vacuous.
- `/coach` is already gated to the `coach` role in middleware; this sub-project
  changes no route-access rules.

## Testing

- Unit: `nav-coach.test.ts` — every coach nav href resolves to a real page; the
  group labels are present; Messages carries the `inbox` badge key; no dupes.
- Unit: `getCoachTeams` — returns teams for head and assistant memberships; empty
  for an unassigned coach (mock db).
- Unit: coach badge count — team-scoped unread count over a mock inbox; 0 when
  no teams.
- Unit: orphan-guard (`route-coverage.test.ts`) stays green and non-vacuous —
  the new `teams.astro` is covered by nav; the `[teamId]` / `[playerId]`
  drill-ins are whitelisted.
- `npx tsc --noEmit` clean; build deferred to CI.
- Manual (if dev server): sign in as a coach — confirm the portal sidebar (not
  the customer top nav), My Teams lists their teams, roster/attendance reachable
  per team, the unread badge shows on Messages; confirm a super-admin/venue
  manager portal is unchanged.

## Scope guard

If migrating the 12 pages surfaces page-specific breakage beyond a mechanical
layout swap (e.g. a page that depended on `BaseLayout`-only context), the layout
migration of that page splits to **SP3b** rather than bloating this plan — the
nav, My Teams hub, and badge ship in SP3, the stubborn page migrations follow.

## Non-goals

- No new coach features; assessment, practice, attendance, and standings logic
  are unchanged.
- Adult-league coaching.
- Media (SP4) and referee (SP5) portals.
