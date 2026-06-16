# Referee Portal IA — Design

**Date:** 2026-06-16
**Status:** Approved (design); ready for implementation planning
**Sub-project:** 5 of 6 in the Admin/Kiosk IA redesign program (the final one)
**Depends on:** SP0 (portal foundation: `PortalLayout`, the portal registry, the
orphan-guard route-coverage test) and SP1 (`AdminLayout`'s on-mount badge fetch,
which this mirrors). Independent of SP3 (coach) / SP4 (media); bases off `main`.

## Context

This is the one **greenfield** portal. The `referee` role exists in the role
enum (`src/lib/auth/roles.ts`) and `primary-role.ts`, but has **no route, no
middleware rule, and no pages** — the registry declares the portal
`available: false` with an empty nav.

The data, however, already exists:

- **Assignments** — `gameOfficials` (`src/lib/db/schema/teams.ts`): one row per
  `(gameId, userId)`, with `position` (default `"referee"`), `feeCents`,
  `paymentStatus` (`unpaid | paid`), `notes`. Admins assign via
  `api/admin/games/[gameId]/officials.ts`; `api/admin/referees.ts` lists
  referee-role users.
- **Games** — `games` (same file): `homeTeamId`, `awayTeamId`, `scheduledAt`,
  `status` (`scheduled | in_progress | completed | postponed | cancelled`),
  `homeScore`, `awayScore`.

So refs are assigned to matches but have nowhere to see or act on those
assignments. SP5 builds that portal: see assigned matches, **report results**
(score + structured incidents + notes), and see pay.

## Scoping principle

Refs act only on **their own** assignments. Every read is scoped to
`gameOfficials.userId = the ref`; the result-write endpoint re-verifies the ref
is an assigned official on that game before mutating the `games` row. Admins
(super_admin) may also reach `/referee` (oversight), but the data is still
scoped to assignments — an admin with no assignments sees an empty portal.

## Design

### Part A — Data model (one additive migration)

New table `gameIncidents` (`src/lib/db/schema/teams.ts`, alongside
`gameOfficials`):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `gameId` | uuid → games (cascade) | |
| `reportedByUserId` | uuid → users (set null) | the ref who logged it |
| `type` | enum `game_incident_type` | `yellow_card \| red_card \| injury \| other` |
| `side` | enum `game_side` | `home \| away` (which team) |
| `player` | varchar(120) null | free-text name / jersey |
| `minute` | integer null | match minute |
| `description` | text null | optional detail |
| `createdAt` / `updatedAt` | timestamp | |

Plus a new nullable column on `games`: `refereeNotes` (text) — the ref's overall
match note. Reporting a result also writes the **existing** `games.homeScore` /
`awayScore` and sets `status → completed`.

Migration is generated with `npm run db:generate` and committed (the program
convention — `db:push` is local-only). It is additive (new table + new nullable
column), so it is forward-compatible.

### Part B — Match report (the core action)

- Page `src/pages/referee/matches/[gameId].astro` + a `MatchReport` component:
  the assigned ref enters the final score, adds/removes structured incident rows
  (type, side, player, minute, description), writes optional match notes, and
  submits. Re-opening a reported match loads the existing score/incidents/notes
  for editing.
- `POST /api/referee/matches/[gameId]/report`: (1) verify the caller is an
  assigned official on this game (a `gameOfficials` row for `(gameId, user.id)`)
  — else 404. This is the authoritative gate; it is org-scoped *by construction*
  (admins only assign officials to games in their own org), so no separate
  `games.organizationId` check is needed (games have no direct org column —
  they're org-scoped via team→season→program). (2) In a transaction, update
  `games` (`homeScore`, `awayScore`, `status = "completed"`, `refereeNotes`) and
  **replace** this game's `gameIncidents` rows with the submitted set
  (delete all rows for the game, then insert the new set, each tagged
  `reportedByUserId = user.id`). Replacing all of the game's incidents is correct
  for the single-ref MVP (one official reports per game); a multi-official model
  would scope the replace to `reportedByUserId`.
- Validation: scores are non-negative integers; incident `type`/`side` are from
  the enums; `minute` (if present) is a non-negative integer. Bad input → 400.

### Part C — My matches (home)

- Page `src/pages/referee/index.astro` + a `RefereeMatches` component.
- `getRefereeAssignments(userId)` → the ref's games (join `gameOfficials` →
  `games`, plus home/away team names), split/sorted into **upcoming**
  (`scheduledAt >= now`, status not completed) and **past/to-report**, each
  flagged `reported` (status `completed`). Each row links to its match report.

### Part D — Pay

- Page `src/pages/referee/pay.astro` + a `RefereePay` component.
- `getRefereePay(userId)` → the ref's assignments with game date, opponent label,
  `feeCents`, `paymentStatus`, and a computed **total unpaid**. Read-only —
  payouts remain manual (Stripe dashboard) per the `gameOfficials` model.

### Part E — Greenfield portal infra

- **Middleware:** add a `ROUTE_RULES` entry
  `{ kind: "role", pattern: /^\/referee(\/|$)/, roles: ["referee", "super_admin"] }`
  (mirroring the `/coach` rule), so `/referee/**` is gated to referees + super
  admins.
- **Registry:** flip the `referee` portal to `available: true` and set
  `nav: REFEREE_NAV`.
- **Nav:** new `src/lib/admin/nav-referee.ts` exporting `REFEREE_NAV`
  (`My matches → /referee` ·badge `reportsOwed`; `Pay → /referee/pay`). The
  match-report page is a dynamic drill-in (not a nav item).
- **Layout:** a `RefereeLayout` (`src/components/referee/referee-layout.tsx`)
  mirroring `AdminLayout`, fetching `/api/referee/nav-badges` on mount.
- **Badge:** a new `reportsOwed` key (added to `NavItem.badgeKey` + `PortalBadges`,
  additive). `GET /api/referee/nav-badges` returns `{ reportsOwed: N }` = the
  ref's past assigned games (`scheduledAt < now`) whose `status` is not yet
  `completed` (a result still owed). Fail-soft: `{ reportsOwed: 0 }` on error.

## Components & boundaries

| Unit | Change | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema/teams.ts` | add `gameIncidents` + `games.refereeNotes` | schema |
| `src/lib/db/migrations/NNNN_*.sql` | new (generated) | additive migration |
| `src/lib/referee/get-referee-assignments.ts` | new | a ref's matches |
| `src/lib/referee/get-referee-pay.ts` | new | a ref's pay rows + total |
| `src/lib/referee/get-reports-owed.ts` | new | count of unreported past games |
| `src/lib/admin/nav-referee.ts` | new | `REFEREE_NAV` |
| `src/lib/portal/registry.ts` | flip referee `available` + nav | wire portal |
| `src/middleware.ts` | add `/referee` ROUTE_RULES entry | route gating |
| `src/components/referee/referee-layout.tsx` | new | portal chrome + badge fetch |
| `src/components/referee/{referee-matches,match-report,referee-pay}.tsx` | new | the three surfaces |
| `src/pages/referee/{index,pay}.astro` + `matches/[gameId].astro` | new | pages |
| `src/pages/api/referee/matches/[gameId]/report.ts` | new | submit result + incidents |
| `src/pages/api/referee/nav-badges.ts` | new | reports-owed count |
| `src/lib/admin/nav-super-admin.ts` + `portal-layout.tsx` | add `reportsOwed` badge key | badge plumbing |
| tests under `tests/unit/referee/` + `nav-referee` + orphan-guard | new/updated | coverage |

## Error / edge handling

- A ref with **no assignments** → My matches and Pay render empty states; badge 0.
- The report endpoint is the security boundary: a ref who is **not** an assigned
  official on the game → 404 (don't leak the game's existence). Cross-org access
  can't happen because a ref is only ever assigned to their own org's games, so
  the assignment check covers it. The nav/pages are convenience; the endpoint
  check is authoritative.
- Score/incident validation rejects bad input with 400 (negative scores, unknown
  enum values).
- Report is **idempotent on re-submit**: the incident set is replaced wholesale,
  so editing a report can't accumulate duplicates.
- The badge endpoint is fail-soft (0 on error, never 500).
- Admins (super_admin) reaching `/referee` see only games they're assigned to
  (usually none) — the portal is referee-first; this is acceptable for oversight.

## Testing

- Unit: `getRefereeAssignments` (scoped to the ref; upcoming/past split;
  reported flag), `getRefereePay` (rows + total unpaid), `getReportsOwed`
  (past + not-completed count), all mock-db.
- Unit: the report endpoint — assignment check (assigned → writes; not assigned
  → 404), score/incident validation, incident replace-not-append.
- Unit: `nav-referee` (hrefs resolve; `My matches` carries `reportsOwed`).
- Unit: middleware `/referee` rule (referee allowed; a parent/coach blocked) if
  the middleware test harness supports it; otherwise assert the `ROUTE_RULES`
  entry exists.
- Unit: orphan-guard covers `/referee` + `/referee/pay`; `matches/[gameId]` is
  dynamic (auto-skipped).
- `npx tsc --noEmit` clean; build (with DB) deferred to CI / controller. The
  migration must be generated + committed so CI's `db:migrate` passes.

## Scope guard

If the structured-incident entry UI grows beyond a straightforward add/remove
list (e.g. per-incident validation rabbit holes, player autocomplete against
rosters), split the **incident capture** to **SP5b** and ship score + match
notes + pay first. The `gameIncidents` table still lands in SP5 so the schema is
stable; only the entry UI defers.

## Non-goals

- Confirm/accept assignment (needs a `gameOfficials` schema change — deferred).
- Multi-official / AR reports — single-ref MVP (the `position` field already
  leaves room).
- Payout processing — pay is read-only; transfers stay manual.
- Live/in-progress scoring — the report is a post-match submission.
