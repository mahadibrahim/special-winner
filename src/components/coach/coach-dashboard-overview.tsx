"use client"

import { useState, useEffect } from "react"
import {
  Users,
  Calendar,
  Trophy,
  ClipboardList,
  ChevronRight,
  Clock,
  MapPin,
  Loader2,
  AlertCircle,
  Target,
  BookOpen,
  Dumbbell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PrePracticeChecklist } from "./pre-practice-checklist"
import { AssessmentNudgeCard } from "./assessment-nudge-card"
import { GlowsNudgeCard } from "./glows-nudge-card"
import { ProgramPlanCard } from "./program-plan-card"
import { OnboardingChecklist } from "./onboarding-checklist"

interface Team {
  id: string
  name: string
  color: string | null
  logoUrl: string | null
  division: string | null
  maxRosterSize: number | null
  isHeadCoach: boolean
  rosterCount: number
  season: {
    id: string
    name: string
    startDate: string
    endDate: string
    status: string
  }
  program: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
    icon: string | null
    color: string | null
  }
  location: {
    id: string
    name: string
  }
  nextGame: {
    id: string
    scheduledAt: string
    opponent: string | null
    venue: string | null
  } | null
}

const sportGradients: Record<string, string> = {
  Soccer: "from-emerald-500 to-green-600",
  Basketball: "from-orange-500 to-amber-600",
  Baseball: "from-red-500 to-rose-600",
  Volleyball: "from-purple-500 to-violet-600",
  Football: "from-amber-600 to-yellow-600",
  Hockey: "from-blue-500 to-cyan-600",
  Tennis: "from-lime-500 to-green-500",
  Swimming: "from-cyan-500 to-blue-500",
}

const defaultGradient = "from-blue-500 to-indigo-600"

function TeamCard({ team }: { team: Team }) {
  const gradient = sportGradients[team.sport.name] || defaultGradient

  const formatNextGame = (date: string) => {
    const gameDate = new Date(date)
    const now = new Date()
    const diffMs = gameDate.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Tomorrow"
    if (diffDays < 7) return `In ${diffDays} days`
    return gameDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <a
      href={`/coach/roster/${team.id}`}
      className="group relative overflow-hidden rounded-2xl bg-paper border border-border hover:border-border transition-all hover:shadow-lg hover:shadow-ink/5"
    >
      {/* Gradient accent bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", gradient)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg",
              gradient
            )}>
              <span className="text-lg font-bold text-white">
                {team.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-ink group-hover:text-primary transition-colors">
                {team.name}
              </h3>
              <p className="text-sm text-ink-muted">
                {team.sport.name}
                {team.division ? ` • ${team.division}` : ""}
              </p>
            </div>
          </div>
          {team.isHeadCoach ? (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
              Head Coach
            </Badge>
          ) : (
            <Badge className="bg-gray-500/20 text-ink-muted border-gray-500/30 text-[10px]">
              Assistant
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-cream-2">
            <div className="flex items-center gap-2 text-ink-muted mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">Roster</span>
            </div>
            <p className="text-lg font-semibold text-ink">
              {team.rosterCount}
              {team.maxRosterSize && (
                <span className="text-sm text-ink-muted">/{team.maxRosterSize}</span>
              )}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-cream-2">
            <div className="flex items-center gap-2 text-ink-muted mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs">Season</span>
            </div>
            <p className="text-sm font-medium text-ink">{team.season.name}</p>
          </div>
        </div>

        {/* Next Game */}
        {team.nextGame && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-0.5">
                  Next Game
                </p>
                <p className="text-sm font-medium text-ink">
                  vs {team.nextGame.opponent || "TBD"}
                </p>
                <div className="flex items-center gap-2 text-xs text-ink-muted mt-1">
                  <Clock className="w-3 h-3" />
                  {formatNextGame(team.nextGame.scheduledAt)}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        )}

        {/* Location */}
        <div className="flex items-center gap-2 mt-3 text-xs text-ink-muted">
          <MapPin className="w-3 h-3" />
          {team.location.name}
        </div>
      </div>
    </a>
  )
}

function QuickActions() {
  return (
    <div className="p-5 rounded-2xl bg-paper border border-border">
      <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary" />
        Quick Actions
      </h3>
      <div className="space-y-2">
        <a
          href="/coach/assessments"
          className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/30 transition-colors group"
        >
          <Target className="w-5 h-5 text-primary" />
          <span className="text-sm text-ink">Player Assessments</span>
          <ChevronRight className="w-4 h-4 text-primary/60 ml-auto group-hover:translate-x-1 transition-all" />
        </a>
        <a
          href="/coach/schedule"
          className="flex items-center gap-3 p-3 rounded-xl bg-cream-2 hover:bg-cream-3 transition-colors group"
        >
          <Calendar className="w-5 h-5 text-ink-muted group-hover:text-primary transition-colors" />
          <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">View Full Schedule</span>
          <ChevronRight className="w-4 h-4 text-ink-faint ml-auto group-hover:translate-x-1 transition-all" />
        </a>
        <a
          href="/coach/practices"
          className="flex items-center gap-3 p-3 rounded-xl bg-cream-2 hover:bg-cream-3 transition-colors group"
        >
          <Dumbbell className="w-5 h-5 text-ink-muted group-hover:text-purple-400 transition-colors" />
          <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">Practice Planner</span>
          <ChevronRight className="w-4 h-4 text-ink-faint ml-auto group-hover:translate-x-1 transition-all" />
        </a>
        <a
          href="/coach/resources"
          className="flex items-center gap-3 p-3 rounded-xl bg-cream-2 hover:bg-cream-3 transition-colors group"
        >
          <BookOpen className="w-5 h-5 text-ink-muted group-hover:text-cyan-400 transition-colors" />
          <span className="text-sm text-ink-2 group-hover:text-ink transition-colors">Coach Resources</span>
          <ChevronRight className="w-4 h-4 text-ink-faint ml-auto group-hover:translate-x-1 transition-all" />
        </a>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: typeof Users
  label: string
  value: string | number
  subtext?: string
  color: string
}) {
  return (
    <div className="p-5 rounded-2xl bg-paper border border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-sm text-ink-muted">{label}</span>
      </div>
      <p className="text-3xl font-bold text-ink">{value}</p>
      {subtext && <p className="text-sm text-ink-muted mt-1">{subtext}</p>}
    </div>
  )
}

export default function CoachDashboardOverview() {
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/coach/teams")

      if (!response.ok) {
        throw new Error("Failed to fetch teams")
      }

      const data = await response.json()
      setTeams(data.teams ?? [])
      setError(null)
    } catch (err) {
      console.error("Error fetching teams:", err)
      setTeams([])
      setError(err instanceof Error ? err.message : "Unable to load teams")
    } finally {
      setIsLoading(false)
    }
  }

  const totalPlayers = teams.reduce((sum, t) => sum + t.rosterCount, 0)
  const upcomingGames = teams.filter(t => t.nextGame).length
  const activeSeasons = new Set(teams.map(t => t.season.id)).size

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-ink font-medium mb-1">Unable to load teams</h3>
        <p className="text-sm text-ink-muted mb-4">{error}</p>
        <Button onClick={fetchTeams} variant="outline" className="border-border">
          Try Again
        </Button>
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <>
        <OnboardingChecklist />
        <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border border-dashed">
          <Users className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-2">No Teams Assigned</h3>
          <p className="text-sm text-ink-muted mb-4">
            You haven't been assigned to any teams yet. Contact your administrator to get started.
          </p>
          <Button asChild>
            <a href="/dashboard">Go to Parent Dashboard</a>
          </Button>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-8">
      <OnboardingChecklist />
      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 dashboard-section">
        <StatCard
          icon={Users}
          label="My Teams"
          value={teams.length}
          color="bg-blue-500"
        />
        <StatCard
          icon={ClipboardList}
          label="Total Players"
          value={totalPlayers}
          color="bg-emerald-500"
        />
        <StatCard
          icon={Calendar}
          label="Upcoming Games"
          value={upcomingGames}
          color="bg-amber-500"
        />
        <StatCard
          icon={Trophy}
          label="Active Seasons"
          value={activeSeasons}
          color="bg-purple-500"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* Teams List - Main Content */}
        <div className="lg:col-span-8 space-y-6">
          <section className="dashboard-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                My Teams
              </h2>
              <span className="text-sm text-ink-muted">{teams.length} teams</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} />
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <section className="dashboard-section">
            <QuickActions />
          </section>

          {/* Assessment cadence nudge (Phase 4) — renders nothing when no
              players are due, so it is NOT wrapped in a spacing section. */}
          <AssessmentNudgeCard />

          {/* Glows & Grows nudge (Plan 2 Task 7) — same fail-soft contract:
              renders nothing while loading, on error, or when nothing is
              pending. */}
          <GlowsNudgeCard />

          {/* Program Blueprint distribution nudge (Task 5) — same fail-soft
              contract: renders nothing while loading, on error, or when no
              recent distribution landed on the coach's own teams. */}
          <ProgramPlanCard />

          {/* Pre-Practice Checklist */}
          <section className="dashboard-section">
            <PrePracticeChecklist />
          </section>

          {/* Curriculum Quick Access */}
          <section className="dashboard-section">
            <a
              href="/coach/resources"
              className="block p-5 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 hover:border-primary/40 transition-all group"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-ink group-hover:text-primary transition-colors">
                    Aspire Curriculum
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Sport guides, skill minibooks, and the Aspire coaching philosophy
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-primary font-medium group-hover:gap-3 transition-all">
                Open resources
                <ChevronRight className="w-3 h-3" />
              </div>
            </a>
          </section>

        </div>
      </div>
    </div>
  )
}
