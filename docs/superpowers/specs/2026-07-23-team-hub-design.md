# Team Hub v1 — captain's persistent team home

**Date:** 2026-07-23
**Branch:** `feat/team-hub` (off `main`)
**Scope:** v1 = the hub shell + Team (roster/fee/invite) + Season (schedule/scores/standings) + the teamGroup identity hook + dashboard entry + receipt-email deep-link. Gear (#471) and rollover/first-dibs (#472) are tracked, NOT built.

## Problem

After reserving a team, the captain manages it only from the in-session HQ screen — no persistent, bookmarkable place to return, invite more, chase unpaid teammates, or (later) see the schedule. The "persistent captain tracker + invite management" was deferred at team-clarity time and never built.

## Goal

A **Team Hub** — the team's permanent home across its lifecycle — reached from the dashboard and a receipt-email deep-link. v1 delivers the roster/fee/invite management and the (already-modeled) schedule/scores/standings, structured so gear and rollover slot in later without a restructure.

## Routes & access

- **`/dashboard/teams`** — "My teams" list: every team the captain runs (by `captainUserId`), each with live paid/total + unpaid nudge. Middleware guarantees auth on `/dashboard/**`.
- **`/dashboard/teams/[id]`** — the hub for one team, captain-only (`team.captainUserId === locals.user.id`, else 404). Tabs: **Team** (default) and **Season**. A disabled "Kit — soon" tab signposts #471.
- Receipt email gains a **"Manage your team"** button → `/dashboard/teams/{id}`; a signed-out captain routes through the existing magic-link sign-in, then lands on the hub.

## Modules

### Team tab (roster + fee + invite)
Reuses the in-session HQ pieces, now persistent:
- **Fee progress**: collected vs total + deadline — from the team payment summary.
- **Roster**: captain first (deposit-paid), then each teammate with paid/unpaid status, share, invited-when. Row actions: **Remind**, **Edit share**, **Remove**.
- **Add teammates** (email + share) and **copy join link**.
- **Remind unpaid** (bulk) with honest backstop copy.

### Season tab (schedule / scores / standings)
Surfaces existing data — **no new schema**:
- **Schedule**: the team's `games` (scheduledAt, opponent, venue) with results (home/away score) or "Upcoming".
- **Standings**: the division's `standings`, the team's row highlighted — reuse `standings-panel` (the public league page's component).
- **Empty state**: a just-reserved team has no games → "Your schedule and standings appear here once the season is set. Season starts {date}."

## Data / API

**Reused (no change):**
- `GET /api/public/team-registrations/[token]` — roster (members + invitees w/ shares + status), payment totals, captain-credit. Captain-gated.
- `POST …/[token]/invite` — sends invites AND updates shares (upsert on unique (team,email)). Covers Add teammates + Edit share.
- `games` / `standings` schema + `standings-panel` component.

**New:**
- A dashboard query: list team_registrations where `captainUserId = user.id` (+ per-team payment summary).
- `DELETE …/[token]/invitee` (or `POST …/[token]/invitee/remove`) — delete a **pending** teamInvitee (captain-only). No-op on a paid invitee.
- `POST …/[token]/remind` — re-send the invite email to unpaid invitees (captain-only, rate-limited).
- The hub reads the captain's team by **id** (dashboard-scoped, auth by captainUserId) — mirror the token GET's shape but keyed by team id + captain auth (so the captain doesn't need the token in the dashboard).

**Schema — the one durable hook:**
- Add `team_registrations.team_group_id` (nullable uuid, soft ref to `team_groups.id`). At team creation (finalize) or lazily, associate the season's team with a persistent `team_group` (create one if none) so rollover (#472) has an anchor. Additive migration. v1 only writes/links it; rollover consumes it later.

## Reuse boundaries / new files

- `src/pages/dashboard/teams/index.astro` (My teams list) + `src/pages/dashboard/teams/[id].astro` (hub shell).
- `src/components/dashboard/teams/TeamHub.tsx` (client island: tabs + Team + Season modules), reusing the invite UI + `standings-panel`.
- `src/pages/api/dashboard/teams/index.ts` (list) + `[id].ts` (detail, captain-auth).
- `src/pages/api/public/team-registrations/[token]/invitee.ts` (remove) + `remind.ts`.
- `finalize-team-deposit.ts` + schema: `team_group_id` link + migration.
- Dashboard nav: add "My teams" entry (persona-gated to users who captain ≥1 team).
- `src/lib/email/send.ts`: add the "Manage your team" link to the deposit receipt.

## Out of scope (tracked)

- **Kit & gear** — #471 (sizes/numbers/names, captain free kit, gear payments). Shown as "soon".
- **Rollover / first-dibs** — #472 (anchored on the `team_group_id` hook v1 adds).
- Manual "charge unpaid now" (deadline cron already auto-charges).
- Non-captain teammate view (they keep the existing own-share-only scoping).

## Testing

- API: list-my-teams (captain-scoped), hub detail (captain-only 403 for non-captain), remove-invitee (pending only), remind. Reuse the `E2ETEAM10`/team fixtures.
- E2E/manual on staging: reserve a team → open `/dashboard/teams` → hub → invite/remind/remove → Season empty state; a season with seeded games shows schedule + standings.
- Unit: any pure share/summary helpers introduced.

## Risks

Captain-auth on every team-scoped read/write (never trust an id alone). The `team_group_id` link touches `finalize-team-deposit` (the idempotent payments path) — keep it best-effort + idempotent. Dashboard nav gating must not show "My teams" to non-captains.
