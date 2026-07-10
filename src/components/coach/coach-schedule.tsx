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
  | { kind: "game"; id: string; date: Date; endDate: Date; teamId: string; teamName: string; game: Game }
  | { kind: "session"; id: string; date: Date; endDate: Date; teamId: string; teamName: string; session: SessionPlan }

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
            // Games carry no duration; keep them in Upcoming for a 2h window
            // so a coach checking mid-game doesn't see an empty schedule.
            endDate: new Date(new Date(game.scheduledAt).getTime() + 120 * 60 * 1000),
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
        endDate: new Date(
          new Date(session.scheduledDate).getTime() + session.durationMinutes * 60 * 1000
        ),
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
    .filter((item) => item.endDate >= now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const past = filteredItems
    .filter((item) => item.endDate < now)
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
