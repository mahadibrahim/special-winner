# Coach Portal Cleanup (D1, D2, D9, D10 + mobile pass) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> NOTE: at execution time, copy this file to docs/superpowers/plans/2026-07-10-coach-portal-cleanup.md on the chore/coach-portal-cleanup branch and commit it there first.

## Goal

Remove the league surfaces that don't belong in the coach portal (D1: standings; D2: coach score entry — coaches run classes/camps/clinics and match results belong to the referee closeout flow), rescope the coach schedule to an honest read-only calendar of practice sessions + games (D2), delete dead controls and orphaned components (D9), fix the guides' audience (D10), and do a phone/tablet-first mobile pass on the coach surfaces (tap targets, always-visible controls, responsive headers).

## Architecture

Astro 5 SSR app with React 19 islands; coach pages live in `src/pages/coach/**`, render `<CoachLayout>` (nav driven by `COACH_NAV` in `src/lib/admin/nav-coach.ts` via `src/lib/portal/registry.ts`), and mount client components from `src/components/coach/**`. API routes in `src/pages/api/**` return JSON. The design system is the cream/ink editorial palette defined in `src/styles/globals.css` (`text-ink`, `text-ink-muted`, `bg-cream-2/3`, `bg-paper`, `border-border`, accents `sage` = success, `ochre` = warning, `navy`, `destructive`) — raw Tailwind gray/green/red utilities are off-palette. Persistent UI states use `EmptyState` / `ErrorBanner` / `LoadingSkeleton` from `@/components/ui/*`.

## Tech Stack

- Astro 5 (SSR, Netlify), React 19, TypeScript (strict; `npx tsc --noEmit` must stay at zero errors — note `.astro` files are NOT covered by tsc, so deletions must also pass `npm run build`)
- Drizzle ORM + postgres-js, PostgreSQL (Railway) — **no migrations in this plan**
- Vitest: API tests in `tests/api/**` hit a running dev server over HTTP
- Playwright e2e in `tests/e2e/**` (run post-merge by CI's test-full; optional locally)

## Global Constraints

- **Branch (stacked):** this is Plan 3 of 3 and stacks on Plan 2. Create the branch off `feat/glows-grows` HEAD at execution time: `git checkout -b chore/coach-portal-cleanup feat/glows-grows` (create from the ref directly — `feat/glows-grows` may be checked out in another worktree). All work in `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/coach-dev-loop`; absolute paths; do NOT cd to the main checkout.
- **Line-number drift:** Plan 2 already deleted `src/pages/dashboard/notes.astro` + `src/components/dashboard/coach-notes-full.tsx`, rewrote `src/components/dashboard/coach-notes.tsx`, added a glows nudge card to the coach dashboard, fixed the achievements `?tab=` deep-link, and touched `src/components/coach/session-detail.tsx`. **Do not touch those changes.** Line numbers cited below come from the Plan-1-era tree — where a task touches a file Plan 2 also touched (notably `coach-dashboard-overview.tsx`), locate edits by the quoted code content, not by line number.
- **Commits:** commit after every task, conventional messages, each ending with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use `git commit -m "<subject>" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`).
- **Dev server for API tests:** start once in the background FROM THE WORKTREE: `R2_MOCK=1 CRON_SECRET=testsecret ./scripts/with-bws.sh npm run dev` (port 4321). Run API tests with `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api <file>`. Mismatched `CRON_SECRET` manifests as spurious 401s.
- **Verification per task:** UI-only tasks verify via `npx tsc --noEmit` + `./scripts/with-bws.sh npm run build` (build catches broken `.astro` imports that tsc misses). Endpoint deletions also run the relevant `tests/api/coach/*` suites. e2e spec changes are optionally runnable locally with the dev server up: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/coach-dashboard.spec.ts` — full e2e runs post-merge, so treat local e2e as optional verification, but per `CLAUDE.md` changed routes silently break post-merge runs, so the spec rewrites in this plan are mandatory.
- **Query discipline / UI primitives / toasts:** same rules as Plan 1 (explicit `orderBy` on any `.limit(1)`; `ErrorBanner`/`EmptyState`/`LoadingSkeleton` for persistent states; `toast` from `sonner` for transient ones). This plan adds no DB queries.
- **Out of scope:** everything Plan 1 (D3–D6) and Plan 2 (glows & grows) already landed; the referee closeout flow; `standings` DB schema (referee flow writes it). Do not merge the PR.

---

## Task 1 — D1: Remove the coach standings surface entirely

Coaches run classes/camps/clinics — there is no league surface in the coach portal. Delete the page, its component, the now-orphaned coach standings API endpoint, the nav item, the dashboard quick action, and the training-deck catalog entry.

**Files**
- Delete: `src/pages/coach/standings.astro`, `src/components/coach/standings-table.tsx`, `src/pages/api/coach/teams/[teamId]/standings.ts`
- Modify: `src/lib/admin/nav-coach.ts` (Standings nav item + `BarChart3` import), `src/components/coach/coach-dashboard-overview.tsx` ("View Standings" quick action), `src/lib/ops-catalog/views/training-deck.ts` (line ~2536)

**Steps**

- [ ] Create the stacked branch: `git checkout -b chore/coach-portal-cleanup feat/glows-grows` then `git branch --show-current` → `chore/coach-portal-cleanup`. Copy this plan into docs/superpowers/plans/2026-07-10-coach-portal-cleanup.md and commit it.
- [ ] Verify importers before deleting (each must return only the files being deleted here):
```bash
grep -rn "coach/standings-table\|components/coach/standings-table" src/
grep -rn "/coach/standings" src/ tests/
grep -rn "teams/\${[^}]*}/standings\|teams/.*\]/standings" src/components/ src/pages/ tests/
```
  Expected consumers: `src/pages/coach/standings.astro` (imports the table), `src/lib/admin/nav-coach.ts:37`, `src/components/coach/coach-dashboard-overview.tsx` (`href="/coach/standings"`), `src/lib/ops-catalog/views/training-deck.ts:2536`, and `src/components/coach/standings-table.tsx:161` (sole caller of `/api/coach/teams/${teamId}/standings`). `tests/` must have zero hits (verified at planning time). Note: `src/components/leagues/standings-panel.tsx` and `src/components/drop-league/drop-standings-table.tsx` are DIFFERENT components (public league surfaces) — leave them alone.
- [ ] Delete the three files:
```bash
git rm src/pages/coach/standings.astro src/components/coach/standings-table.tsx "src/pages/api/coach/teams/[teamId]/standings.ts"
```
- [ ] In `src/lib/admin/nav-coach.ts`: remove `BarChart3,` from the lucide import block and remove the Standings item so the Season group becomes:
```ts
  {
    name: "Season",
    items: [
      { name: "Schedule", href: "/coach/schedule", icon: Calendar },
    ],
  },
```
- [ ] In `src/components/coach/coach-dashboard-overview.tsx` (`QuickActions`), delete the whole "View Standings" anchor (locate by content — Plan 2 shifted line numbers):
```tsx
        <a
          href="/coach/standings"
          className="flex items-center gap-3 p-3 rounded-xl bg-cream-2 hover:bg-cream-3 transition-colors group"
        >
          <Trophy className="w-5 h-5 text-ink-muted group-hover:text-amber-400 transition-colors" />
          <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">View Standings</span>
          <ChevronRight className="w-4 h-4 text-ink-faint ml-auto group-hover:translate-x-1 transition-all" />
        </a>
```
  Keep the `Trophy` import — it is still used by the "Active Seasons" `StatCard`.
- [ ] In `src/lib/ops-catalog/views/training-deck.ts`, inside `PORTAL_PAGES["role.coach"]`, delete the line:
```ts
    { path: "/coach/standings", description: "League standings" },
```
- [ ] Verify: `npx tsc --noEmit` (zero errors) then `./scripts/with-bws.sh npm run build` (succeeds — this is what catches a stale `.astro` import). Re-run `grep -rn "coach/standings" src/ tests/` → zero hits.
- [ ] Commit: `git add -A && git commit -m "chore(coach): remove standings page, table, endpoint, and nav entry" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 2 — D2: Rescope the coach schedule to a read-only calendar; delete coach score entry

`coach-schedule.tsx` currently ships 4 hardcoded `mockGames` served as real data on any fetch failure or empty roster, a `GameScoreModal` + hover-pencil score entry (referee closeout owns results), a `handleSaveScore` that "still update[s] local state" on API failure, and dead `viewMode` state (`Grid3X3`/`List` icons imported, never rendered). Rewrite it as sessions + games merged read-only, and delete `PUT /api/coach/games/[gameId]/score`.

**Files**
- Rewrite: `src/components/coach/coach-schedule.tsx` (full replacement below)
- Delete: `src/pages/api/coach/games/[gameId]/score.ts` (the `[gameId]` directory becomes empty — remove it)
- Rewrite: `tests/api/coach/games-scores.test.ts` → `tests/api/coach/games.test.ts`
- Unchanged consumers: `src/pages/coach/schedule.astro` renders `<CoachSchedule client:load />` with no props — no change needed

**Interfaces**
- Consumes: `GET /api/coach/teams` → `{ teams: [{ id, name, ... }] }`; `GET /api/coach/teams/[teamId]/games` → `{ games: Game[] }` (per-team, `isHome` relative to that team; kept — referee flow feeds it); `GET /api/coach/sessions?limit=100` → `{ sessions: [{ id, teamId, title, scheduledDate, durationMinutes, status, team: { id, name }, ... }] }` (`src/pages/api/coach/sessions/index.ts` — NOTE it returns **403** when the user coaches zero teams, so skip the call when the teams list is empty)
- Produces: no coach-writable game state anywhere; scores render display-only when present

**Steps**

- [ ] Verify the score endpoint's callers before deleting (must return only `coach-schedule.tsx`, which this task rewrites, and `tests/api/coach/games-scores.test.ts`, which this task rewrites):
```bash
grep -rn "games/.*}/score\|games/\[gameId\]/score" src/ tests/ | grep -v "api/feedback"
grep -rn "method: \"PUT\"" src/components/coach/
```
  (The `PUT` grep should show no games-related hits outside `coach-schedule.tsx`; `/api/feedback/[token]/score` is an unrelated NPS endpoint.) Also confirm no e2e spec touches the schedule: `grep -rn "coach/schedule" tests/e2e/` → zero hits (verified at planning time).
- [ ] Delete the endpoint and its empty directory:
```bash
git rm "src/pages/api/coach/games/[gameId]/score.ts"
rmdir "src/pages/api/coach/games/[gameId]" "src/pages/api/coach/games" 2>/dev/null || true
```
- [ ] Replace the entire contents of `src/components/coach/coach-schedule.tsx` with:

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, ChevronRight, Clock, Dumbbell, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { cn } from "@/lib/utils"

// The coach schedule is a READ-ONLY calendar: practice sessions the coach
// plans (GET /api/coach/sessions) merged chronologically with league games
// (GET /api/coach/teams/[teamId]/games). Scores are entered by the referee
// closeout flow and only displayed here — there is no coach score entry.

type GameStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled"
type SessionStatus = "draft" | "planned" | "in_progress" | "completed" | "cancelled"

interface Game {
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  scheduledAt: string
  status: GameStatus
  homeScore: number | null
  awayScore: number | null
  fieldNumber: string | null
  notes: string | null
  isHome: boolean
  opponent: { id: string; name: string; color: string | null } | null
  venue: { id: string; name: string; address: string | null } | null
}

interface SessionPlan {
  id: string
  teamId: string
  title: string
  scheduledDate: string
  durationMinutes: number
  status: SessionStatus
  team: { id: string; name: string }
}

interface Team {
  id: string
  name: string
}

type ScheduleItem =
  | { kind: "game"; id: string; date: Date; teamId: string; teamName: string; game: Game }
  | { kind: "session"; id: string; date: Date; teamId: string; teamName: string; session: SessionPlan }

const gameStatusConfig: Record<GameStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-primary/10 text-primary border-primary/20" },
  in_progress: { label: "In Progress", className: "bg-ochre/20 text-ochre border-ochre/40" },
  completed: { label: "Final", className: "bg-sage/15 text-sage border-sage/40" },
  postponed: { label: "Postponed", className: "bg-ochre/20 text-ochre border-ochre/40" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
}

const sessionStatusConfig: Record<SessionStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-cream-3 text-ink-muted border-border" },
  planned: { label: "Planned", className: "bg-primary/10 text-primary border-primary/20" },
  in_progress: { label: "In Progress", className: "bg-ochre/20 text-ochre border-ochre/40" },
  completed: { label: "Completed", className: "bg-sage/15 text-sage border-sage/40" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/20" },
}

function formatDay(date: Date) {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === now.toDateString()) return "Today"
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
}

function DateLine({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <Calendar className="w-4 h-4" />
      <span>{formatDay(date)}</span>
      <span className="text-ink-faint">•</span>
      <Clock className="w-3.5 h-3.5" />
      <span>{formatTime(date)}</span>
    </div>
  )
}

function GameRow({ item }: { item: Extract<ScheduleItem, { kind: "game" }> }) {
  const { game, teamName } = item
  const status = gameStatusConfig[game.status]
  const ourScore = game.isHome ? game.homeScore : game.awayScore
  const theirScore = game.isHome ? game.awayScore : game.homeScore
  const hasScore = ourScore !== null && theirScore !== null
  const won = ourScore !== null && theirScore !== null && ourScore > theirScore
  const lost = ourScore !== null && theirScore !== null && ourScore < theirScore
  const tied = hasScore && !won && !lost

  return (
    <div className="p-4 rounded-2xl bg-paper border border-border">
      <div className="flex items-center justify-between mb-3">
        <DateLine date={item.date} />
        <Badge variant="outline" className={cn("text-[10px]", status.className)}>
          {status.label}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <p className="font-semibold text-ink mb-1">{teamName}</p>
          <p className="text-xs text-ink-muted">{game.isHome ? "Home" : "Away"}</p>
        </div>

        {hasScore ? (
          <div className="px-4 py-2 rounded-xl bg-cream-3">
            <div className="flex items-center gap-3">
              <span className={cn("text-2xl font-bold", won ? "text-sage" : lost ? "text-destructive" : "text-ink")}>
                {ourScore}
              </span>
              <span className="text-ink-faint">-</span>
              <span className={cn("text-2xl font-bold", lost ? "text-sage" : won ? "text-destructive" : "text-ink")}>
                {theirScore}
              </span>
            </div>
            {won && <p className="text-[10px] text-sage text-center mt-1">WIN</p>}
            {lost && <p className="text-[10px] text-destructive text-center mt-1">LOSS</p>}
            {tied && <p className="text-[10px] text-ink-muted text-center mt-1">TIE</p>}
          </div>
        ) : (
          <div className="px-4 py-3 rounded-xl bg-cream-2">
            <span className="text-lg font-bold text-ink-muted">vs</span>
          </div>
        )}

        <div className="flex-1 text-center">
          <p className="font-semibold text-ink mb-1">{game.opponent?.name ?? "TBD"}</p>
          <p className="text-xs text-ink-muted">{game.isHome ? "Away" : "Home"}</p>
        </div>
      </div>

      {game.venue && (
        <div className="flex items-center gap-2 mt-3 text-xs text-ink-muted">
          <MapPin className="w-3 h-3" />
          {game.venue.name}
          {game.fieldNumber && ` - Field ${game.fieldNumber}`}
        </div>
      )}
    </div>
  )
}

function SessionRow({ item }: { item: Extract<ScheduleItem, { kind: "session" }> }) {
  const { session } = item
  const status = sessionStatusConfig[session.status]

  return (
    <a
      href={`/coach/practices/${session.id}`}
      className="block p-4 rounded-2xl bg-paper border border-border hover:border-primary/30 hover:bg-cream-2 transition-colors group"
    >
      <div className="flex items-center justify-between mb-3">
        <DateLine date={item.date} />
        <Badge variant="outline" className={cn("text-[10px]", status.className)}>
          {status.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Dumbbell className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate group-hover:text-primary transition-colors">
            {session.title}
          </p>
          <p className="text-xs text-ink-muted">
            {session.team.name} • {session.durationMinutes} min practice
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-faint group-hover:translate-x-1 transition-transform" />
      </div>
    </a>
  )
}

export default function CoachSchedule() {
  const [teams, setTeams] = useState<Team[]>([])
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string>("all")
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    fetchSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchSchedule = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const teamsRes = await fetch("/api/coach/teams")
      if (!teamsRes.ok) throw new Error("Failed to load your teams")
      const teamsData = await teamsRes.json()
      const coachTeams: Team[] = (teamsData.teams || []).map((t: { id: string; name: string }) => ({
        id: t.id,
        name: t.name,
      }))
      setTeams(coachTeams)

      if (coachTeams.length === 0) {
        // No teams — nothing to fetch (and /api/coach/sessions 403s for a
        // user with zero coached teams). The empty state below is honest.
        setItems([])
        return
      }

      const [gamesPerTeam, sessionsRes] = await Promise.all([
        Promise.all(
          coachTeams.map(async (team) => {
            const res = await fetch(`/api/coach/teams/${team.id}/games`)
            if (!res.ok) throw new Error("Failed to load games")
            const data = await res.json()
            return (data.games || []).map((game: Game) => ({ game, team }))
          })
        ),
        fetch("/api/coach/sessions?limit=100"),
      ])
      if (!sessionsRes.ok) throw new Error("Failed to load practice sessions")
      const sessionsData = await sessionsRes.json()
      const sessions: SessionPlan[] = sessionsData.sessions || []

      // A game between two of the coach's own teams comes back once per
      // team fetch — keep the first occurrence.
      const gameItems = new Map<string, ScheduleItem>()
      for (const { game, team } of gamesPerTeam.flat()) {
        if (!gameItems.has(game.id)) {
          gameItems.set(game.id, {
            kind: "game",
            id: `game-${game.id}`,
            date: new Date(game.scheduledAt),
            teamId: team.id,
            teamName: team.name,
            game,
          })
        }
      }

      const sessionItems: ScheduleItem[] = sessions.map((session) => ({
        kind: "session",
        id: `session-${session.id}`,
        date: new Date(session.scheduledDate),
        teamId: session.teamId,
        teamName: session.team.name,
        session,
      }))

      setItems([...gameItems.values(), ...sessionItems])
    } catch (err) {
      console.error("Error loading schedule:", err)
      setError("Could not load your schedule. Check your connection and try again.")
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }

  const filteredItems = useMemo(() => {
    if (selectedTeam === "all") return items
    return items.filter((item) => item.teamId === selectedTeam)
  }, [items, selectedTeam])

  const now = new Date()
  const upcoming = filteredItems
    .filter((item) => item.date >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const past = filteredItems
    .filter((item) => item.date < now)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="card" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 max-w-lg">
        <ErrorBanner message={error} />
        <Button variant="outline" onClick={fetchSchedule}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-ink flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Schedule
        </h2>
        <p className="text-sm text-ink-muted mt-1">
          Your practice sessions and games in one place. {upcoming.length} upcoming, {past.length} past.
        </p>
      </div>

      {/* Filters */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {teams.length > 1 && (
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-3 py-2 rounded-xl bg-cream-2 border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowPast(!showPast)}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all border",
              showPast
                ? "bg-cream-3 text-ink border-ink-faint/20"
                : "bg-cream-2 text-ink-muted border-border"
            )}
          >
            Show Past
          </button>
        </div>
      )}

      {upcoming.length === 0 && (!showPast || past.length === 0) ? (
        <EmptyState
          title="No upcoming sessions or games yet"
          description="Practice sessions you plan and games on the league schedule will show up here."
          icon={<Calendar className="h-10 w-10" />}
        >
          <Button asChild>
            <a href="/coach/practices/new">Plan a practice</a>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
                Upcoming ({upcoming.length})
              </h3>
              <div className="space-y-3">
                {upcoming.map((item) =>
                  item.kind === "game" ? <GameRow key={item.id} item={item} /> : <SessionRow key={item.id} item={item} />
                )}
              </div>
            </div>
          )}

          {showPast && past.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
                Past ({past.length})
              </h3>
              <div className="space-y-3">
                {past.map((item) =>
                  item.kind === "game" ? <GameRow key={item.id} item={item} /> : <SessionRow key={item.id} item={item} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

  This drops, by construction: `mockGames` and every fallback to it, `GameScoreModal`, `handleSaveScore`, the hover `Edit3` pencil, the dead `viewMode`/`"month"` state, and the `Grid3X3`/`List`/`Trophy`/`Filter`/`AlertCircle`/`X`/`Check`/`Edit3`/`Loader2`/`ChevronLeft`/`ChevronRight`(paginator) imports.
- [ ] Rename and rewrite the API test — the GET coverage stays, the PUT coverage flips to "endpoint is gone":
```bash
git mv tests/api/coach/games-scores.test.ts tests/api/coach/games.test.ts
```
  New contents of `tests/api/coach/games.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

// D2 (Plan 3): the coach portal is read-only for games — match results are
// entered by the referee closeout flow. PUT /api/coach/games/[gameId]/score
// was deleted; this suite keeps the read coverage and pins the deletion.
describe("Coach Games API (read-only)", () => {
  let coachCookie: string;
  let teamId: string;

  beforeAll(async () => {
    coachCookie = await getCoachCookie();

    const teamsRes = await apiFetch("/api/coach/teams", {
      method: "GET",
      cookie: coachCookie,
    });
    const teamsJson = await expectJson(teamsRes, 200);
    expect(Array.isArray(teamsJson.teams)).toBe(true);
    expect(teamsJson.teams.length).toBeGreaterThan(0);
    teamId = teamsJson.teams[0].id;
  });

  afterAll(() => {
    resetCookies();
  });

  describe("GET /api/coach/teams/:teamId/games", () => {
    it("returns games array for a valid team (200)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
        cookie: coachCookie,
      });

      const json = await expectJson(res, 200);
      expect(Array.isArray(json.games)).toBe(true);

      if (json.games.length > 0) {
        const game = json.games[0];
        expect(game.id).toBeDefined();
        expect(game.status).toBeDefined();
        expect(typeof game.isHome).toBe("boolean");
      }
    });

    it("rejects unauthenticated GET (401)", async () => {
      const res = await apiFetch(`/api/coach/teams/${teamId}/games`, {
        method: "GET",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("removed coach score entry", () => {
    it("PUT /api/coach/games/:gameId/score no longer exists (404)", async () => {
      const res = await apiFetch(
        `/api/coach/games/00000000-0000-0000-0000-000000000000/score`,
        {
          method: "PUT",
          cookie: coachCookie,
          body: JSON.stringify({ homeScore: 1, awayScore: 0 }),
        }
      );

      expect(res.status).toBe(404);
    });
  });
});
```
- [ ] With the dev server running (restart it after the route deletion so the dead route is actually gone from the dev server's manifest): `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/games.test.ts` — all pass.
- [ ] Verify: `npx tsc --noEmit` (zero errors) and `./scripts/with-bws.sh npm run build`. Re-grep: `grep -rn "score" src/components/coach/coach-schedule.tsx` → only display-only `homeScore`/`awayScore`/`ourScore`/`theirScore` reads; `grep -rn "GameScoreModal\|mockGames" src/` → zero hits.
- [ ] Commit: `git add -A && git commit -m "feat(coach): read-only schedule of sessions + games; remove coach score entry" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 3 — D9: Delete orphaned never-imported components

Zero-importer status verified at planning time; re-verify before each deletion (Plan 2 landed since). `dashboard/notes.astro` and `coach-notes-full.tsx` were already deleted by Plan 2 — skip them.

**Files**
- Delete: `src/components/coach/player-notes-editor.tsx`, `src/components/coach/in-session-reminder.tsx`, `src/components/coach/skill-selector.tsx`, `src/components/dashboard/skill-progress-chart.tsx`, `src/components/dashboard/achievement-gallery.tsx`
- Modify: `src/components/coach/coaching-tip-card.tsx` — delete only the `CoachingTipsList` export (the file's other export, `CoachingTipCard`, IS used by `pre-practice-checklist.tsx`)

**Steps**

- [ ] Verify zero importers for every deletion target (run the greps individually if the loop misbehaves):
```bash
grep -rn "player-notes-editor\|PlayerNotesEditor" src/ | grep -v "components/coach/player-notes-editor.tsx"
grep -rn "in-session-reminder\|InSessionReminder" src/ | grep -v "components/coach/in-session-reminder.tsx"
grep -rn "skill-selector\|SkillSelector" src/ | grep -v "components/coach/skill-selector.tsx"
grep -rn "skill-progress-chart\|SkillProgressChart" src/ | grep -v "dashboard/skill-progress-chart.tsx"
grep -rn "achievement-gallery\|AchievementGallery" src/ | grep -v "dashboard/achievement-gallery.tsx"
grep -rn "CoachingTipsList" src/ | grep -v "coaching-tip-card.tsx"
```
  All must be empty.
- [ ] Delete the five orphans:
```bash
git rm src/components/coach/player-notes-editor.tsx src/components/coach/in-session-reminder.tsx src/components/coach/skill-selector.tsx src/components/dashboard/skill-progress-chart.tsx src/components/dashboard/achievement-gallery.tsx
```
- [ ] In `src/components/coach/coaching-tip-card.tsx`, delete everything from the comment `// Component to display multiple tips` (line ~227) through the end of the file — i.e. the `CoachingTipsListProps` interface and the entire `export function CoachingTipsList(...)`. Keep all imports: `Lightbulb` is still used inside `CoachingTipCard` (icon config at line ~49).
- [ ] Verify: `npx tsc --noEmit` (zero errors) and `./scripts/with-bws.sh npm run build`.
- [ ] Commit: `git add -A && git commit -m "chore: delete orphaned coach/dashboard components" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 4 — D9: Remove dead controls and fix papercuts

Five components ship controls that do nothing or lie. All edits are locate-by-content (Plan 2 drift applies to `coach-dashboard-overview.tsx`).

**Files**
- Modify: `src/components/coach/coach-dashboard-overview.tsx`, `src/components/coach/coach-assessments-overview.tsx`, `src/components/coach/pre-practice-checklist.tsx`, `src/components/coach/roster-table.tsx`, `src/components/dashboard/children-overview.tsx`

**Steps**

- [ ] **`coach-dashboard-overview.tsx` — "Add Player Note" quick action** (a `<button>` with no handler; glows & grows from Plan 2 is now the notes channel). In `QuickActions`, delete:
```tsx
        <button
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-cream-2 hover:bg-cream-3 transition-colors group"
        >
          <MessageSquare className="w-5 h-5 text-ink-muted group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">Add Player Note</span>
          <Plus className="w-4 h-4 text-ink-faint ml-auto" />
        </button>
```
  Then remove `MessageSquare` and `Plus` from the lucide import **only if** they now have zero uses in the file (Plan 2 may have added uses — check with `grep -n "MessageSquare\|Plus" src/components/coach/coach-dashboard-overview.tsx`).
- [ ] **`coach-dashboard-overview.tsx` — dangling "Soccer • " when `division` is null** (`TeamCard`): change
```tsx
              <p className="text-sm text-ink-muted">{team.sport.name} • {team.division}</p>
```
  to
```tsx
              <p className="text-sm text-ink-muted">
                {team.sport.name}
                {team.division ? ` • ${team.division}` : ""}
              </p>
```
- [ ] **`coach-assessments-overview.tsx` — "View all assessments" button** (lines ~527–534; no `onClick`/`href`). Decision (explicit, per review): this component IS the `/coach/assessments` page (`src/pages/coach/assessments.astro` mounts it) and no fuller assessment-list view exists, so wiring it to `/coach/assessments` would navigate to itself — **remove it**. Replace:
```tsx
              {recentAssessments.length > 10 && (
                <Button
                  variant="ghost"
                  className="w-full text-sm text-ink-muted hover:text-ink"
                >
                  View all assessments
                </Button>
              )}
```
  with an honest static caption:
```tsx
              {recentAssessments.length > 10 && (
                <p className="text-xs text-ink-faint text-center pt-1">
                  Showing the 10 most recent
                </p>
              )}
```
- [ ] **`pre-practice-checklist.tsx` — "Start Practice" button with no handler wired.** The dashboard renders `<PrePracticeChecklist />` bare, so `onComplete` is `undefined` and the button (lines 271–278) does nothing when clicked. Simplest honest fix: render it only when a handler exists. Change:
```tsx
          {/* Complete Button */}
          {isComplete && (
```
  to:
```tsx
          {/* Complete Button — only when the parent actually wired a handler
              (the coach dashboard renders this checklist bare, and a button
              that does nothing is worse than no button). */}
          {isComplete && onComplete && (
```
  Keep the checklist, tips, and the `onComplete?.()` call in `toggleItem` (a no-op without the prop) unchanged.
- [ ] **`roster-table.tsx` — "Add note" icon → "coming soon" toast.** Remove the whole affordance:
  1. Delete `handleAddNote` (lines ~269–273):
```tsx
  const handleAddNote = (_playerId: string) => {
    toast.info("Player notes editor coming soon", {
      description: "For now, use the parent dashboard's coach notes feature.",
    })
  }
```
  2. In `PlayerCard` (line ~68): remove `onAddNote` from the destructured props and from the props type (`onAddNote: () => void`), and delete the button (lines ~129–135):
```tsx
            <button
              onClick={onAddNote}
              className="p-2 rounded-lg hover:bg-cream-3 transition-colors"
              title="Add note"
            >
              <MessageSquare className="w-4 h-4 text-ink-muted hover:text-primary" />
            </button>
```
  3. Delete both `onAddNote={() => handleAddNote(player.player.id)}` props at the two `<PlayerCard>` call sites (lines ~456 and ~468).
  4. Remove `MessageSquare` from the lucide import (now unused). Keep `toast` — `handleExportRoster` still calls `toast.error`.
- [ ] **`children-overview.tsx` — "Development Progress" expander wired to hardcoded `skillAssessments: []`.** The child's development page is the real surface; the expander always expands to nothing. Remove:
  1. The `SkillAssessment` interface (lines 29–33) and the `skillAssessments: SkillAssessment[]` field from `Child` (line 43).
  2. The `SkillBar` component (lines 92–109).
  3. In `ChildCard`: the `const [expanded, setExpanded] = useState(false)` (line 112) and the entire `{/* Skills Preview */}` block (lines ~189–234) — the expander button, the expanding grid, AND the collapsed preview bars (`{!expanded && (...)}`).
  4. The `skillAssessments: [],` line in the fetch mapping (line ~336).
  5. Now-unused lucide imports: `TrendingUp` and `Sparkles` (only `SkillBar` used them). Keep `ChevronRight` (still used by the profile chevron button), `Star` (`coachRating` badge), and `Award` (`recentAchievement` banner).
  6. Keep the "Development" quick-action link (`href={`/dashboard/children/${child.id}/development`}`, `data-testid="child-development-link"`) untouched — `tests/e2e/development-radar.spec.ts` navigates through it.
- [ ] Verify no test references the removed strings: `grep -rn "Add Player Note\|Development Progress\|Add note\|View all assessments\|Start Practice" tests/` → zero hits (verified at planning time; re-check).
- [ ] Verify: `npx tsc --noEmit` (zero errors) and `./scripts/with-bws.sh npm run build`.
- [ ] Commit: `git add -A && git commit -m "fix(coach): remove dead controls and no-op affordances" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 5 — D9: Rewrite the vacuous e2e sections in coach-dashboard.spec.ts

`tests/e2e/coach-dashboard.spec.ts` has four `describe` blocks (currently lines ~179–292: "Session Planning", "Player Development", "Resources", "Activities Library") that navigate to routes that don't exist (`/coach/sessions`, `/coach/sessions/new`, `/coach/development`, `/coach/activities`) and assert only that `<body>` is visible — they pass against a 404. Rewrite against the real routes with real assertions. (The "Attendance Tracking" block was already rewritten in an earlier pass — do not touch it here; its `bg-red-100` assertion is updated in Task 7 together with the palette change.)

**Files**
- Modify: `tests/e2e/coach-dashboard.spec.ts` (replace the four describe blocks; keep "Dashboard Overview", "Team Management", "Assessment Nudge", "Attendance Tracking", and "Coach Authorization" as-is)

**Real-route facts to build on (verified):** practices list = `/coach/practices` (`PracticesOverview` has a hydration beacon, renders "Today's Sessions" stat and an `a[href="/coach/practices/new"]`); planner = `/coach/practices/new` (`PracticePlanner` renders label "Session Title *"); development/assessments = `/coach/assessments` (`CoachAssessmentsOverview`, no beacon, renders "Total Players" stat and `h2` "Players" after a client fetch); resources = `/coach/resources` (server-rendered `h2` headings "Sport Guides" and "Skill Minibooks"). There is no `/coach/activities` page — the activity library lives inside the planner — so that describe is deleted, not rewritten.

**Steps**

- [ ] Replace the "Session Planning", "Player Development", "Resources", and "Activities Library" describe blocks with:

```ts
  test.describe("Practice Planning", () => {
    // The practice tools live at /coach/practices (list) and
    // /coach/practices/new (planner). The old spec navigated to
    // /coach/sessions[/new] — routes that have never existed — and asserted
    // only that <body> was visible, so it passed against a 404.
    test("practices overview shows session stats and a New Session link", async ({ page }) => {
      await page.goto("/coach/practices");
      await waitForPageLoad(page);
      await waitForHydration(page);

      // PracticesOverview stat cards render after its client-side fetch;
      // generous timeout for shared-dev-server cold starts (see the
      // Attendance block's comment above).
      await expect(page.getByText("Today's Sessions")).toBeVisible({ timeout: 30000 });
      await expect(page.locator('a[href="/coach/practices/new"]').first()).toBeVisible();
    });

    test("practice planner form has the required title field", async ({ page }) => {
      await page.goto("/coach/practices/new");
      await waitForPageLoad(page);

      await expect(page.getByText("Session Title *")).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe("Player Development", () => {
    // The old spec navigated to /coach/development, which has never existed.
    // Player development lives at /coach/assessments.
    test("assessments overview lists players with stats", async ({ page }) => {
      await page.goto("/coach/assessments");
      await waitForPageLoad(page);

      // CoachAssessmentsOverview renders after a client-side fetch (no
      // hydration beacon on this island — wait on real content instead).
      await expect(page.getByText("Total Players")).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent Assessments" })).toBeVisible();
    });
  });

  test.describe("Resources", () => {
    test("shows the curriculum library with sport guides and minibooks", async ({ page }) => {
      await page.goto("/coach/resources");
      await waitForPageLoad(page);

      await expect(page).toHaveURL(/\/coach\/resources/);
      // Server-rendered curriculum sections — real content, not just <body>.
      await expect(page.getByRole("heading", { name: "Sport Guides" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("heading", { name: "Skill Minibooks" })).toBeVisible();
    });
  });
```
  and delete the "Activities Library" describe entirely (there is no such surface; searching/filtering activities is exercised through the planner UI).
- [ ] Optional local verification (dev server must be running): `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/coach-dashboard.spec.ts` — the new Practice Planning / Player Development / Resources tests pass. If fixtures are missing locally, `npm run db:seed:e2e` first. (Full e2e is post-merge; do not block the task on unrelated pre-existing failures in other blocks.)
- [ ] `npx tsc --noEmit` still clean (the spec is TS).
- [ ] Commit: `git add -A && git commit -m "test(e2e): point coach specs at real routes with real assertions" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 6 — D10: Fix the guides' audience

All four public guides end with a floating action bar whose second button is "Back to Coach Portal" → role-gated `/coach` (a parent who found the guide organically gets bounced to signin). Point it at the audience-neutral static index instead. Also gloss the jargon on `guides/index.astro` for parents.

**Files**
- Modify: `src/pages/guides/soccer.astro` (anchor at lines ~1215–1232), `src/pages/guides/basketball.astro` (~1240–1257), `src/pages/guides/hockey.astro` (~1244–1261), `src/pages/guides/baseball.astro` (~1303–1320)
- Modify: `src/pages/guides/index.astro` (lines ~90–96)

**Steps**

- [ ] In **each of the four** guide files, find the floating-bar anchor (identical markup in all four; the `style` template literal interpolates `sport.primaryColor` — leave it untouched):
```astro
      <a
        href="/coach"
        style={`
          background: white;
          color: ${sport.primaryColor};
          border: 2px solid ${sport.primaryColor};
          padding: 1rem 1.5rem;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          text-decoration: none;
          display: flex;
          align-items: center;
        `}
      >
        Back to Coach Portal
      </a>
```
  and change exactly two things: `href="/coach"` → `href="/guides/"` and the label `Back to Coach Portal` → `All guides`.
- [ ] In `src/pages/guides/index.astro`, replace the publication blurb (currently):
```astro
          <p class="text-ink-2 text-base leading-relaxed serif italic">
            Four sport-specific coaching frameworks,
            grounded in the
            <strong class="not-italic font-medium">PCA Double-Goal Coach</strong>,
            <strong class="not-italic font-medium">ELM</strong>, and
            <strong class="not-italic font-medium">TDEQ-5</strong>
            youth development models.
            Free to read, free to print, free to share.
          </p>
```
  with:
```astro
          <p class="text-ink-2 text-base leading-relaxed serif italic">
            Four sport-specific coaching frameworks, grounded in three youth
            development models: the
            <strong class="not-italic font-medium">PCA Double-Goal Coach</strong>
            (win games, yes — but the bigger goal is building confident kids),
            <strong class="not-italic font-medium">ELM</strong>
            (praising Effort, Learning, and bouncing back from Mistakes over the scoreboard), and
            <strong class="not-italic font-medium">TDEQ-5</strong>
            (a research-backed check that training develops the whole athlete, not just the season's record).
            Free to read, free to print, free to share.
          </p>
```
- [ ] Verify: `grep -rn "Back to Coach Portal" src/` → zero hits; `grep -c 'href="/guides/"' src/pages/guides/soccer.astro src/pages/guides/basketball.astro src/pages/guides/hockey.astro src/pages/guides/baseball.astro` → at least 1 each. `./scripts/with-bws.sh npm run build` succeeds (these are `.astro`-only changes — tsc won't see them).
- [ ] Commit: `git add -A && git commit -m "fix(guides): audience-neutral guide footer links; gloss framework jargon" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 7 — Mobile pass 1: session-timeline controls + attendance tracker tap targets, tokens, and error state

`session-timeline.tsx` hides Edit/Delete behind `opacity-0 group-hover:opacity-100` (invisible on touch) and shows a `GripVertical` drag handle with `cursor-grab` although no drag-and-drop is implemented. `attendance-tracker.tsx` has 32px status buttons (44px is the tap-target floor), a raw gray/green Tailwind palette off the cream design system, and a fetch failure that logs to console only — leaving a misleading "No players on the roster yet" empty state.

**Files**
- Modify: `src/components/coach/session-timeline.tsx` (lines ~160–165, ~200–201; imports)
- Modify: `src/components/coach/attendance-tracker.tsx` (imports; state; `fetchAttendanceData`; `getStatusIcon`; `getStatusBadge`; header; rate bar; status buttons; summary badges)
- Modify: `tests/e2e/coach-dashboard.spec.ts` (line ~175 — the `bg-red-100` class assertion tracks the old palette)

**Steps**

- [ ] **`session-timeline.tsx`:**
  1. Delete the drag-handle block (lines ~160–165) — the affordance lies, no DnD exists:
```tsx
            {/* Drag handle */}
            {!readOnly && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="w-4 h-4 text-ink-muted" />
              </div>
            )}
```
  2. Make the Edit/Delete actions always visible (line ~201). Change:
```tsx
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
```
  to:
```tsx
              <div className="flex items-center gap-1">
```
  (both Buttons inside stay as-is).
  3. Remove `GripVertical,` from the lucide import.
- [ ] **`attendance-tracker.tsx`:**
  1. Add the import: `import { ErrorBanner } from "@/components/ui/error-banner"`.
  2. Add state next to `isSaving`: `const [loadError, setLoadError] = useState<string | null>(null)`.
  3. In `fetchAttendanceData`, surface failures instead of console-only (which currently leaves the "No players" empty state lying):
```tsx
  async function fetchAttendanceData() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(`/api/coach/attendance?teamId=${teamId}`)
      if (!response.ok) throw new Error("Failed to fetch attendance data")
      const data = await response.json()
      setTeam(data.team)
      setRoster(data.roster)
      setAttendanceRecords(data.attendance)
      setStats(data.stats)
      setUpcomingGames(data.upcomingGames)
    } catch (err) {
      console.error(err)
      setLoadError("Could not load the roster and attendance records. Check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }
```
  4. After the `if (isLoading)` block, add:
```tsx
  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-ink">Attendance Tracker</h1>
        <div className="space-y-3 max-w-lg">
          <ErrorBanner message={loadError} />
          <Button variant="outline" onClick={fetchAttendanceData}>
            Retry
          </Button>
        </div>
      </div>
    )
  }
```
  5. Header to tokens: `text-gray-900` → `text-ink` on the `h1`; `text-gray-600` → `text-ink-muted` on the subtitle `p`.
  6. Status icons (`getStatusIcon`) — token colors, sized up for the bigger buttons:
```tsx
  function getStatusIcon(status: AttendanceStatus) {
    switch (status) {
      case "present":
        return <Check className="h-5 w-5 text-sage" />
      case "absent":
        return <X className="h-5 w-5 text-destructive" />
      case "late":
        return <Clock className="h-5 w-5 text-ochre" />
      case "excused":
        return <AlertCircle className="h-5 w-5 text-navy" />
    }
  }
```
  7. Selected-status backgrounds (`getStatusBadge`):
```tsx
  function getStatusBadge(status: AttendanceStatus) {
    const colors: Record<AttendanceStatus, string> = {
      present: "bg-sage/15 text-sage",
      absent: "bg-destructive/10 text-destructive",
      late: "bg-ochre/20 text-ochre",
      excused: "bg-navy/10 text-navy",
    }
    return colors[status]
  }
```
  8. Status buttons — 44px minimum tap targets (was `h-8 w-8` = 32px):
```tsx
                                <Button
                                  key={status}
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-11 w-11 p-0",
                                    currentStatus === status && getStatusBadge(status)
                                  )}
                                  onClick={() => updatePlayerAttendance(player.id, status)}
                                  title={status.charAt(0).toUpperCase() + status.slice(1)}
                                >
                                  {getStatusIcon(status)}
                                </Button>
```
  9. Attendance-rate bar: `bg-gray-200` → `bg-cream-3` (track), `bg-green-500` → `bg-sage` (fill).
  10. Summary badges: `bg-green-50 text-green-700` → `bg-sage/10 text-sage`; `bg-red-50 text-red-700` → `bg-destructive/5 text-destructive`; `bg-yellow-50 text-yellow-700` → `bg-ochre/10 text-ochre`; `bg-blue-50 text-blue-700` → `bg-navy/5 text-navy`.
- [ ] **`tests/e2e/coach-dashboard.spec.ts`** — the "can set a player's attendance status" test pins the old class. Change:
```ts
      await expect(absentButton).toHaveClass(/bg-red-100/);
```
  to:
```ts
      await expect(absentButton).toHaveClass(/bg-destructive\/10/);
```
- [ ] Verify: `grep -n "gray-\|green-\|red-100\|yellow-\|blue-" src/components/coach/attendance-tracker.tsx` → zero hits; `npx tsc --noEmit`; `./scripts/with-bws.sh npm run build`. Optional local e2e: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/coach-dashboard.spec.ts -g "Attendance"`.
- [ ] Commit: `git add -A && git commit -m "fix(coach): touch-friendly session controls and attendance tracker (tokens, 44px targets, error state)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 8 — Mobile pass 2: responsive players-panel header in coach-assessments-overview

The Players panel header pins a `w-48` search input and `w-36` team select beside the heading — on phones they overflow/crush. Stack them full-width on small screens.

**Files**
- Modify: `src/components/coach/coach-assessments-overview.tsx` (lines ~452–483)

**Steps**

- [ ] Replace the Players header block:
```tsx
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-ink-muted" />
              Players
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48 h-8 text-sm bg-paper border-border"
                />
              </div>

              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-36 h-8 text-xs bg-paper border-border">
```
  with:
```tsx
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-ink-muted" />
              Players
            </h2>

            {/* Full-width stacked controls on phones; inline on ≥sm. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-48 h-9 text-sm bg-paper border-border"
                />
              </div>

              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-full sm:w-36 h-9 text-xs bg-paper border-border">
```
  Everything from `<SelectValue placeholder="All Teams" />` down is unchanged.
- [ ] Verify: `npx tsc --noEmit`; `./scripts/with-bws.sh npm run build`.
- [ ] Commit: `git add -A && git commit -m "fix(coach): responsive players panel header on assessments overview" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`

---

## Task 9 — Final gate: full verification + stacked PR

**Files**
- No source changes (fixups only if the gate fails)

**Steps**

- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `npx vitest run --config vitest.config.ts --project unit` — all unit tests pass.
- [ ] `./scripts/with-bws.sh npm run build` — succeeds.
- [ ] With the dev server running (restarted after the route deletions): `CRON_SECRET=testsecret TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/coach/` — the whole coach suite passes (Plan 1's suites are regression guards here; `games.test.ts` pins the removed endpoint). Triage any failure by whether the failing file overlaps this branch's changes.
- [ ] Optional: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/coach-dashboard.spec.ts` — full e2e runs post-merge.
- [ ] Push and open the PR **based on `feat/glows-grows`** (stacked; do NOT merge):

```bash
git push -u origin chore/coach-portal-cleanup
gh pr create --base feat/glows-grows --title "chore(coach): portal cleanup (D1, D2, D9, D10 + mobile pass)" --body "$(cat <<'EOF'
## Summary
Plan 3 of 3 for the coach fixing stage. **Stacked on #<PR-2-number> (feat/glows-grows) — retarget this PR's base to main after PR 2 merges.**

- **D1 standings removed:** coaches run classes/camps/clinics, not leagues. Deleted /coach/standings, the StandingsTable component, the now-orphaned GET /api/coach/teams/[teamId]/standings endpoint, the sidebar nav item, the dashboard quick action, and the training-deck catalog entry.
- **D2 read-only schedule:** coach-schedule.tsx rewritten — real practice sessions (GET /api/coach/sessions) merged chronologically with real games; mock-data fallbacks, GameScoreModal, and the hover score-entry pencil are gone. Fetch failure → ErrorBanner + Retry (never mock data); honest EmptyState; LoadingSkeleton. Deleted PUT /api/coach/games/[gameId]/score (referee closeout owns results); games-scores.test.ts → games.test.ts pins the removal.
- **D9 dead code:** deleted 5 never-imported components + the CoachingTipsList export; removed the no-op "Add Player Note" quick action, the self-referential "View all assessments" button, the unwired "Start Practice" button (renders only when onComplete is passed), the "coming soon" Add-note toast icon, and the always-empty Development Progress expander on the family dashboard; fixed the dangling "Soccer • " when division is null. Rewrote the vacuous e2e sections that navigated to nonexistent routes (/coach/sessions, /coach/development, /coach/activities) to target /coach/practices, /coach/assessments, /coach/resources with real assertions.
- **D10 guides audience:** the four public guides' "Back to Coach Portal" (role-gated /coach) → "All guides" (/guides/); ELM / TDEQ-5 / PCA Double-Goal Coach each got a plain-English parenthetical on the guides index.
- **Mobile pass:** session-timeline Edit/Delete always visible (were hover-only — invisible on touch) and the fake drag handle removed; attendance tracker gets 44px tap targets, cream design tokens (e2e class assertion updated), and an ErrorBanner + Retry instead of a lying empty state; assessments Players header stacks full-width on phones.

No migrations. Referee closeout flow untouched.

## Test plan
- Rewritten API suite: tests/api/coach/games.test.ts (read coverage + 404 pin on the deleted score endpoint); full tests/api/coach/ suite green locally
- Rewritten e2e: tests/e2e/coach-dashboard.spec.ts (Practice Planning, Player Development, Resources; attendance palette assertion)
- Gate: npx tsc --noEmit, unit suite, ./scripts/with-bws.sh npm run build

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
  (Fill `#<PR-2-number>` with the real PR number for `feat/glows-grows` — find it via `gh pr list --head feat/glows-grows`.)
- [ ] Report the PR URL. Do not merge.

---

### Critical Files for Implementation

- src/components/coach/coach-schedule.tsx
- src/components/coach/coach-dashboard-overview.tsx
- src/components/coach/attendance-tracker.tsx
- tests/e2e/coach-dashboard.spec.ts
- src/lib/admin/nav-coach.ts
