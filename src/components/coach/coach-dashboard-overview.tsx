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
  TrendingUp,
  MessageSquare,
  Plus
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

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

// Mock data for development
const mockTeams: Team[] = [
  {
    id: "1",
    name: "U10 Lightning",
    color: "#22c55e",
    logoUrl: null,
    division: "U10 Fall League",
    maxRosterSize: 15,
    isHeadCoach: true,
    rosterCount: 12,
    season: {
      id: "s1",
      name: "Fall 2025",
      startDate: "2025-09-01",
      endDate: "2025-12-15",
      status: "active",
    },
    program: {
      id: "p1",
      name: "Youth Soccer League",
    },
    sport: {
      id: "sp1",
      name: "Soccer",
      icon: "soccer",
      color: "#22c55e",
    },
    location: {
      id: "l1",
      name: "Powell Sports Complex",
    },
    nextGame: {
      id: "g1",
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
      opponent: "Dublin FC",
      venue: "Field 3",
    },
  },
  {
    id: "2",
    name: "U8 Thunder",
    color: "#3b82f6",
    logoUrl: null,
    division: "U8 Development",
    maxRosterSize: 12,
    isHeadCoach: false,
    rosterCount: 10,
    season: {
      id: "s1",
      name: "Fall 2025",
      startDate: "2025-09-01",
      endDate: "2025-12-15",
      status: "active",
    },
    program: {
      id: "p1",
      name: "Youth Soccer League",
    },
    sport: {
      id: "sp1",
      name: "Soccer",
      icon: "soccer",
      color: "#22c55e",
    },
    location: {
      id: "l1",
      name: "Powell Sports Complex",
    },
    nextGame: {
      id: "g2",
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
      opponent: "Westerville United",
      venue: "Field 1",
    },
  },
]

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
      href={`/coach/teams/${team.id}`}
      className="group relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all hover:shadow-lg hover:shadow-blue-500/5"
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
              <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                {team.name}
              </h3>
              <p className="text-sm text-gray-500">{team.sport.name} • {team.division}</p>
            </div>
          </div>
          {team.isHeadCoach ? (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
              Head Coach
            </Badge>
          ) : (
            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px]">
              Assistant
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-white/[0.03]">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">Roster</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {team.rosterCount}
              {team.maxRosterSize && (
                <span className="text-sm text-gray-500">/{team.maxRosterSize}</span>
              )}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03]">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs">Season</span>
            </div>
            <p className="text-sm font-medium text-white">{team.season.name}</p>
          </div>
        </div>

        {/* Next Game */}
        {team.nextGame && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-blue-400 uppercase tracking-wider mb-0.5">
                  Next Game
                </p>
                <p className="text-sm font-medium text-white">
                  vs {team.nextGame.opponent || "TBD"}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <Clock className="w-3 h-3" />
                  {formatNextGame(team.nextGame.scheduledAt)}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        )}

        {/* Location */}
        <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
          <MapPin className="w-3 h-3" />
          {team.location.name}
        </div>
      </div>
    </a>
  )
}

function QuickActions() {
  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-blue-400" />
        Quick Actions
      </h3>
      <div className="space-y-2">
        <a
          href="/coach/schedule"
          className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors group"
        >
          <Calendar className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors" />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">View Full Schedule</span>
          <ChevronRight className="w-4 h-4 text-gray-600 ml-auto group-hover:translate-x-1 transition-all" />
        </a>
        <a
          href="/coach/standings"
          className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors group"
        >
          <Trophy className="w-5 h-5 text-gray-500 group-hover:text-amber-400 transition-colors" />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">View Standings</span>
          <ChevronRight className="w-4 h-4 text-gray-600 ml-auto group-hover:translate-x-1 transition-all" />
        </a>
        <button
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors group"
        >
          <MessageSquare className="w-5 h-5 text-gray-500 group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Add Player Note</span>
          <Plus className="w-4 h-4 text-gray-600 ml-auto" />
        </button>
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
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {subtext && <p className="text-sm text-gray-500 mt-1">{subtext}</p>}
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
      // Use real data if available, otherwise use mock data for development
      setTeams(data.teams.length > 0 ? data.teams : mockTeams)
    } catch (err) {
      console.error("Error fetching teams:", err)
      // Fall back to mock data for development
      setTeams(mockTeams)
      setError(null) // Don't show error in development
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
      <div className="text-center py-16 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-white font-medium mb-1">Unable to load teams</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <Button onClick={fetchTeams} variant="outline" className="border-white/10">
          Try Again
        </Button>
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] border-dashed">
        <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <h3 className="text-white font-medium mb-2">No Teams Assigned</h3>
        <p className="text-sm text-gray-500 mb-4">
          You haven't been assigned to any teams yet. Contact your administrator to get started.
        </p>
        <Button asChild>
          <a href="/dashboard">Go to Parent Dashboard</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
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
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                My Teams
              </h2>
              <span className="text-sm text-gray-500">{teams.length} teams</span>
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

          {/* Recent Activity Placeholder */}
          <section className="dashboard-section">
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">Game completed</p>
                    <p className="text-xs text-gray-500">U10 Lightning won 3-1</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">Note added</p>
                    <p className="text-xs text-gray-500">Progress note for Emma J.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">New player</p>
                    <p className="text-xs text-gray-500">Liam M. joined U8 Thunder</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
