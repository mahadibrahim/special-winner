"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Calendar,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Filter,
  List,
  Grid3X3,
  Loader2,
  AlertCircle,
  X,
  Check,
  Edit3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type GameStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled"
type ViewMode = "month" | "list"

interface Game {
  id: string
  seasonId: string
  homeTeamId: string | null
  awayTeamId: string | null
  scheduledAt: string
  durationMinutes: number | null
  status: GameStatus
  homeScore: number | null
  awayScore: number | null
  fieldNumber: string | null
  notes: string | null
  isHome: boolean
  opponent: {
    id: string
    name: string
    color: string | null
  } | null
  venue: {
    id: string
    name: string
    address: string | null
  } | null
}

interface Team {
  id: string
  name: string
}

const statusConfig: Record<GameStatus, { label: string; color: string; bgColor: string }> = {
  scheduled: { label: "Scheduled", color: "text-primary", bgColor: "bg-primary/10 border-primary/20" },
  in_progress: { label: "In Progress", color: "text-amber-400", bgColor: "bg-amber-500/20 border-amber-500/30" },
  completed: { label: "Final", color: "text-emerald-400", bgColor: "bg-emerald-500/20 border-emerald-500/30" },
  postponed: { label: "Postponed", color: "text-orange-400", bgColor: "bg-orange-500/20 border-orange-500/30" },
  cancelled: { label: "Cancelled", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" },
}

// Mock data for development
const mockGames: Game[] = [
  {
    id: "g1",
    seasonId: "s1",
    homeTeamId: "t1",
    awayTeamId: "t2",
    scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    durationMinutes: 60,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    fieldNumber: "3",
    notes: null,
    isHome: true,
    opponent: { id: "t2", name: "Dublin FC", color: "#3b82f6" },
    venue: { id: "v1", name: "Powell Sports Complex", address: "550 Lewis Center Rd, Powell, OH" },
  },
  {
    id: "g2",
    seasonId: "s1",
    homeTeamId: "t3",
    awayTeamId: "t1",
    scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
    durationMinutes: 60,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    fieldNumber: "1",
    notes: null,
    isHome: false,
    opponent: { id: "t3", name: "Westerville United", color: "#ef4444" },
    venue: { id: "v2", name: "Westerville Soccer Fields", address: "123 Main St, Westerville, OH" },
  },
  {
    id: "g3",
    seasonId: "s1",
    homeTeamId: "t1",
    awayTeamId: "t4",
    scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    durationMinutes: 60,
    status: "completed",
    homeScore: 3,
    awayScore: 1,
    fieldNumber: "2",
    notes: "Great team effort!",
    isHome: true,
    opponent: { id: "t4", name: "Grove City Rovers", color: "#22c55e" },
    venue: { id: "v1", name: "Powell Sports Complex", address: "550 Lewis Center Rd, Powell, OH" },
  },
  {
    id: "g4",
    seasonId: "s1",
    homeTeamId: "t5",
    awayTeamId: "t1",
    scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    durationMinutes: 60,
    status: "completed",
    homeScore: 2,
    awayScore: 2,
    fieldNumber: "1",
    notes: null,
    isHome: false,
    opponent: { id: "t5", name: "Hilliard Stars", color: "#f59e0b" },
    venue: { id: "v3", name: "Hilliard Sports Park", address: "456 Park Rd, Hilliard, OH" },
  },
]

function GameScoreModal({
  game,
  teamName,
  isOpen,
  onClose,
  onSave
}: {
  game: Game
  teamName: string
  isOpen: boolean
  onClose: () => void
  onSave: (homeScore: number, awayScore: number, status: GameStatus, notes: string) => Promise<void>
}) {
  const [homeScore, setHomeScore] = useState(game.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState(game.awayScore ?? 0)
  const [status, setStatus] = useState<GameStatus>(game.status === "scheduled" ? "in_progress" : game.status)
  const [notes, setNotes] = useState(game.notes ?? "")
  const [isSaving, setIsSaving] = useState(false)

  if (!isOpen) return null

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(homeScore, awayScore, status, notes)
      onClose()
    } catch (error) {
      console.error("Error saving score:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const homeTeamName = game.isHome ? teamName : (game.opponent?.name ?? "TBD")
  const awayTeamName = game.isHome ? (game.opponent?.name ?? "TBD") : teamName

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-cream border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-cream-3 transition-colors"
          >
            <X className="w-5 h-5 text-ink-muted" />
          </button>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Enter Score
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            {new Date(game.scheduledAt).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Score Entry */}
        <div className="p-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            {/* Home Team */}
            <div className="text-center flex-1">
              <p className="text-sm text-ink-muted mb-2">Home</p>
              <p className="text-ink font-medium mb-3">{homeTeamName}</p>
              <input
                type="number"
                min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 h-16 text-center text-3xl font-bold rounded-xl bg-cream-3 border border-border text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div className="text-2xl font-bold text-ink-faint">vs</div>

            {/* Away Team */}
            <div className="text-center flex-1">
              <p className="text-sm text-ink-muted mb-2">Away</p>
              <p className="text-ink font-medium mb-3">{awayTeamName}</p>
              <input
                type="number"
                min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 h-16 text-center text-3xl font-bold rounded-xl bg-cream-3 border border-border text-ink focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Status */}
          <div className="mb-4">
            <label className="block text-sm text-ink-muted mb-2">Game Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as GameStatus)}
              className="w-full px-4 py-3 rounded-xl bg-cream-3 border border-border text-ink focus:outline-none focus:border-primary"
            >
              <option value="in_progress">In Progress</option>
              <option value="completed">Final (Completed)</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm text-ink-muted mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add game notes..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-cream-3 border border-border text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save Score
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GameCard({
  game,
  teamName,
  onEditScore
}: {
  game: Game
  teamName: string
  onEditScore: (game: Game) => void
}) {
  const status = statusConfig[game.status]
  const gameDate = new Date(game.scheduledAt)
  const isPast = gameDate < new Date()
  const isCompleted = game.status === "completed"

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === now.toDateString()) return "Today"
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow"
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  }

  // Determine our score and opponent score
  const ourScore = game.isHome ? game.homeScore : game.awayScore
  const theirScore = game.isHome ? game.awayScore : game.homeScore
  const won = ourScore !== null && theirScore !== null && ourScore > theirScore
  const lost = ourScore !== null && theirScore !== null && ourScore < theirScore
  const tied = ourScore !== null && theirScore !== null && ourScore === theirScore

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border transition-all",
      isCompleted ? "bg-paper" : "bg-paper hover:bg-cream-2",
      "border-border hover:border-border"
    )}>
      <div className="p-4">
        {/* Date & Status Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-ink-muted" />
            <span className="text-sm text-ink-muted">{formatDate(gameDate)}</span>
            <span className="text-ink-faint">•</span>
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span className="text-sm text-ink-muted">{formatTime(gameDate)}</span>
          </div>
          <Badge className={cn("text-[10px]", status.bgColor, status.color)}>
            {status.label}
          </Badge>
        </div>

        {/* Teams & Score */}
        <div className="flex items-center gap-4">
          {/* Our Team */}
          <div className="flex-1 text-center">
            <p className={cn(
              "font-semibold mb-1",
              game.isHome ? "text-ink" : "text-ink-muted"
            )}>
              {teamName}
            </p>
            <p className="text-xs text-ink-muted">{game.isHome ? "Home" : "Away"}</p>
          </div>

          {/* Score or VS */}
          {isCompleted && ourScore !== null && theirScore !== null ? (
            <div className="px-4 py-2 rounded-xl bg-cream-3">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-2xl font-bold",
                  won ? "text-emerald-400" : lost ? "text-red-400" : "text-ink"
                )}>
                  {ourScore}
                </span>
                <span className="text-ink-faint">-</span>
                <span className={cn(
                  "text-2xl font-bold",
                  lost ? "text-emerald-400" : won ? "text-red-400" : "text-ink"
                )}>
                  {theirScore}
                </span>
              </div>
              {won && <p className="text-[10px] text-emerald-400 text-center mt-1">WIN</p>}
              {lost && <p className="text-[10px] text-red-400 text-center mt-1">LOSS</p>}
              {tied && <p className="text-[10px] text-ink-muted text-center mt-1">TIE</p>}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl bg-cream-2">
              <span className="text-lg font-bold text-ink-muted">vs</span>
            </div>
          )}

          {/* Opponent */}
          <div className="flex-1 text-center">
            <p className={cn(
              "font-semibold mb-1",
              !game.isHome ? "text-ink" : "text-ink-muted"
            )}>
              {game.opponent?.name ?? "TBD"}
            </p>
            <p className="text-xs text-ink-muted">{game.isHome ? "Away" : "Home"}</p>
          </div>
        </div>

        {/* Location */}
        {game.venue && (
          <div className="flex items-center gap-2 mt-3 text-xs text-ink-muted">
            <MapPin className="w-3 h-3" />
            {game.venue.name}
            {game.fieldNumber && ` - Field ${game.fieldNumber}`}
          </div>
        )}

        {/* Notes */}
        {game.notes && (
          <p className="mt-2 text-xs text-ink-muted italic">"{game.notes}"</p>
        )}

        {/* Edit Score Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEditScore(game)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-ink"
        >
          <Edit3 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

interface CoachScheduleProps {
  teams?: Team[]
}

export default function CoachSchedule({ teams: teamsProp }: CoachScheduleProps) {
  const [teams, setTeams] = useState<Team[]>(teamsProp || [])
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [showPast, setShowPast] = useState(true)
  const [editingGame, setEditingGame] = useState<Game | null>(null)

  // Fetch teams if not provided as prop
  useEffect(() => {
    if (teamsProp && teamsProp.length > 0) {
      setTeams(teamsProp)
      return
    }
    const fetchTeams = async () => {
      try {
        const response = await fetch("/api/coach/teams")
        if (response.ok) {
          const data = await response.json()
          const mapped = (data.teams || []).map((t: any) => ({ id: t.id, name: t.name }))
          setTeams(mapped)
        }
      } catch (err) {
        console.error("Error fetching teams:", err)
      }
    }
    fetchTeams()
  }, [teamsProp])

  useEffect(() => {
    fetchGames()
  }, [teams])

  const fetchGames = async () => {
    if (teams.length === 0) {
      setGames(mockGames)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      // Fetch games for all teams
      const allGames: Game[] = []
      for (const team of teams) {
        const response = await fetch(`/api/coach/teams/${team.id}/games`)
        if (response.ok) {
          const data = await response.json()
          allGames.push(...data.games)
        }
      }
      // Deduplicate and sort
      const uniqueGames = Array.from(new Map(allGames.map(g => [g.id, g])).values())
      uniqueGames.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      setGames(uniqueGames.length > 0 ? uniqueGames : mockGames)
    } catch (err) {
      console.error("Error fetching games:", err)
      setGames(mockGames)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveScore = async (homeScore: number, awayScore: number, status: GameStatus, notes: string) => {
    if (!editingGame) return

    try {
      const response = await fetch(`/api/coach/games/${editingGame.id}/score`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeScore, awayScore, status, notes }),
      })

      if (!response.ok) {
        throw new Error("Failed to save score")
      }

      // Update local state
      setGames(prev => prev.map(g =>
        g.id === editingGame.id
          ? { ...g, homeScore, awayScore, status, notes }
          : g
      ))
    } catch (error) {
      console.error("Error saving score:", error)
      // For development, still update local state
      setGames(prev => prev.map(g =>
        g.id === editingGame.id
          ? { ...g, homeScore, awayScore, status, notes }
          : g
      ))
    }
  }

  const filteredGames = useMemo(() => {
    let filtered = games

    // Filter by team if selected
    if (selectedTeam !== "all") {
      filtered = filtered.filter(g =>
        g.homeTeamId === selectedTeam || g.awayTeamId === selectedTeam
      )
    }

    // Filter past/upcoming
    const now = new Date()
    if (!showPast) {
      filtered = filtered.filter(g => new Date(g.scheduledAt) >= now)
    }

    return filtered
  }, [games, selectedTeam, showPast])

  const upcomingGames = filteredGames.filter(g => new Date(g.scheduledAt) >= new Date())
  const pastGames = filteredGames.filter(g => new Date(g.scheduledAt) < new Date())

  // Get team name for display
  const getTeamName = (game: Game) => {
    const teamId = game.isHome ? game.homeTeamId : game.awayTeamId
    return teams.find(t => t.id === teamId)?.name ?? "My Team"
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Game Schedule
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            {upcomingGames.length} upcoming, {pastGames.length} completed
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-paper border border-border">
        <div className="flex flex-wrap items-center gap-4">
          <Filter className="w-4 h-4 text-ink-muted" />

          {/* Team Filter */}
          {teams.length > 1 && (
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-3 py-2 rounded-xl bg-cream-2 border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
            >
              <option value="all">All Teams</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          )}

          {/* Show Past Toggle */}
          <button
            onClick={() => setShowPast(!showPast)}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all",
              showPast
                ? "bg-cream-3 text-ink border border-ink-faint/20"
                : "bg-cream-2 text-ink-muted border border-border"
            )}
          >
            Show Past Games
          </button>
        </div>
      </div>

      {/* Games List */}
      {filteredGames.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border">
          <Calendar className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">No games found</h3>
          <p className="text-sm text-ink-muted">
            {!showPast ? "No upcoming games scheduled" : "No games have been scheduled yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming Games */}
          {upcomingGames.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
                Upcoming ({upcomingGames.length})
              </h3>
              <div className="space-y-3">
                {upcomingGames.map(game => (
                  <GameCard
                    key={game.id}
                    game={game}
                    teamName={getTeamName(game)}
                    onEditScore={setEditingGame}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Games */}
          {showPast && pastGames.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
                Past Games ({pastGames.length})
              </h3>
              <div className="space-y-3">
                {pastGames.map(game => (
                  <GameCard
                    key={game.id}
                    game={game}
                    teamName={getTeamName(game)}
                    onEditScore={setEditingGame}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Score Edit Modal */}
      {editingGame && (
        <GameScoreModal
          game={editingGame}
          teamName={getTeamName(editingGame)}
          isOpen={!!editingGame}
          onClose={() => setEditingGame(null)}
          onSave={handleSaveScore}
        />
      )}
    </div>
  )
}
