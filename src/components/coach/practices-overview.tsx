"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  FileText,
  ChevronRight,
  Users,
  CalendarDays,
  Play,
  CheckCircle,
  Edit3,
  MoreHorizontal,
} from "lucide-react"

interface Team {
  id: string
  name: string
  sport: {
    id: string
    name: string
  }
}

interface SessionPlan {
  id: string
  teamId: string
  title: string
  scheduledDate: string
  durationMinutes: number
  status: "draft" | "planned" | "in_progress" | "completed" | "cancelled"
  segments: any[] | null
  objectives: string[] | null
  team: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
  }
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-ink-muted", bg: "bg-gray-500/20" },
  planned: { label: "Planned", color: "text-primary", bg: "bg-primary/10" },
  in_progress: { label: "In Progress", color: "text-amber-400", bg: "bg-amber-500/20" },
  completed: { label: "Completed", color: "text-green-400", bg: "bg-green-500/20" },
  cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-500/20" },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr) > new Date()
}

export default function PracticesOverview() {
  const [sessions, setSessions] = useState<SessionPlan[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [teamFilter, setTeamFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        const res = await fetch("/api/coach/sessions?limit=50")
        if (!res.ok) throw new Error("Failed to fetch sessions")

        const data = await res.json()
        setSessions(data.sessions || [])
        setTeams(data.teams || [])
      } catch (err) {
        console.error("Error fetching sessions:", err)
        setError(err instanceof Error ? err.message : "Failed to load sessions")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    if (teamFilter !== "all" && session.teamId !== teamFilter) return false
    if (statusFilter !== "all" && session.status !== statusFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (!session.title.toLowerCase().includes(query)) return false
    }
    return true
  })

  // Group sessions
  const upcomingSessions = filteredSessions.filter((s) => isUpcoming(s.scheduledDate) && s.status !== "completed")
  const pastSessions = filteredSessions.filter((s) => !isUpcoming(s.scheduledDate) || s.status === "completed")
  const todaySessions = upcomingSessions.filter((s) => isToday(s.scheduledDate))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-ink mb-2">Something went wrong</h3>
        <p className="text-sm text-ink-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{todaySessions.length}</p>
              <p className="text-xs text-ink-muted">Today's Sessions</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{upcomingSessions.length}</p>
              <p className="text-xs text-ink-muted">Upcoming</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">
                {sessions.filter((s) => s.status === "completed").length}
              </p>
              <p className="text-xs text-ink-muted">Completed</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{teams.length}</p>
              <p className="text-xs text-ink-muted">Teams</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-paper border-border"
          />
        </div>

        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[180px] bg-paper border-border">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-paper border-border">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Today's Sessions */}
      {todaySessions.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-muted mb-3 flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Today's Sessions
          </h2>
          <div className="space-y-2">
            {todaySessions.map((session) => (
              <SessionCard key={session.id} session={session} highlight />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Sessions */}
      {upcomingSessions.filter((s) => !isToday(s.scheduledDate)).length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-muted mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Sessions
          </h2>
          <div className="space-y-2">
            {upcomingSessions
              .filter((s) => !isToday(s.scheduledDate))
              .slice(0, 10)
              .map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
          </div>
        </section>
      )}

      {/* Past Sessions */}
      {pastSessions.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-muted mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Past Sessions
          </h2>
          <div className="space-y-2">
            {pastSessions.slice(0, 10).map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {filteredSessions.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <FileText className="w-12 h-12 text-ink-faint mx-auto mb-4" />
          <h3 className="text-lg font-medium text-ink mb-2">No sessions found</h3>
          <p className="text-sm text-ink-muted mb-6">
            {sessions.length === 0
              ? "Create your first practice session to get started"
              : "Try adjusting your filters"}
          </p>
          <Button asChild>
            <a href="/coach/practices/new">
              <Plus className="w-4 h-4 mr-2" />
              Create Session
            </a>
          </Button>
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, highlight }: { session: SessionPlan; highlight?: boolean }) {
  const statusConfig = STATUS_CONFIG[session.status] || STATUS_CONFIG.draft
  const segmentCount = session.segments?.length || 0

  return (
    <a
      href={`/coach/practices/${session.id}`}
      className={cn(
        "group block p-4 rounded-xl border transition-all",
        highlight
          ? "bg-primary/5 border-primary/20 hover:border-primary/30"
          : "bg-paper border-border hover:border-border"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Date Badge */}
        <div className={cn(
          "w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0",
          highlight ? "bg-primary/20" : "bg-cream-2"
        )}>
          <span className={cn(
            "text-xs font-medium",
            highlight ? "text-primary" : "text-ink-muted"
          )}>
            {new Date(session.scheduledDate).toLocaleDateString("en-US", { weekday: "short" })}
          </span>
          <span className={cn(
            "text-xl font-bold",
            highlight ? "text-primary" : "text-ink"
          )}>
            {new Date(session.scheduledDate).getDate()}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-ink truncate">{session.title}</h3>
            <Badge variant="outline" className={cn("text-[10px] shrink-0", statusConfig.color)}>
              {statusConfig.label}
            </Badge>
          </div>

          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {session.team.name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(session.scheduledDate)} • {session.durationMinutes}min
            </span>
            {segmentCount > 0 && (
              <span>{segmentCount} segments</span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-5 h-5 text-ink-faint group-hover:text-ink-muted transition-colors shrink-0" />
      </div>
    </a>
  )
}
