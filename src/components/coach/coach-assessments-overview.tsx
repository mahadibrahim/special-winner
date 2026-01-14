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
import PlayerAssessmentForm from "./player-assessment-form"
import AssessmentHistory from "./assessment-history"
import {
  Search,
  Plus,
  Users,
  Target,
  Activity,
  Brain,
  Dumbbell,
  TrendingUp,
  Calendar,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react"

interface Player {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  photoUrl: string | null
  team?: {
    id: string
    name: string
    sport: {
      id: string
      name: string
    }
  } | null
}

interface Team {
  id: string
  name: string
  sport: {
    id: string
    name: string
  }
  season?: {
    id: string
    name: string
  } | null
}

interface Assessment {
  id: string
  familyMemberId: string
  skillId: string
  teamId: string | null
  seasonId: string | null
  coachUserId: string
  level: number
  previousLevel: number | null
  observationContext: "practice" | "game" | "test" | "scrimmage" | "training"
  notes: string | null
  strengths: string[] | null
  areasForImprovement: string[] | null
  assessedAt: string
  createdAt: string
  skill: {
    id: string
    name: string
    description: string | null
  }
  domain: {
    id: string
    name: string
    displayName: string
    color: string
  }
  stage: {
    id: string
    name: string
  }
  player: {
    id: string
    firstName: string
    lastName: string
  }
}

const DOMAIN_ICONS: Record<string, typeof Target> = {
  technical: Target,
  tactical: Brain,
  physical: Dumbbell,
  psychological: Activity,
}

function getDomainIcon(domainName: string) {
  return DOMAIN_ICONS[domainName.toLowerCase()] || Target
}

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function PlayerCard({
  player,
  recentAssessments,
  onClick,
  onAssess,
}: {
  player: Player
  recentAssessments: Assessment[]
  onClick: () => void
  onAssess: () => void
}) {
  const age = calculateAge(player.birthDate)
  const initials = `${player.firstName[0]}${player.lastName[0]}`
  const lastAssessed = recentAssessments[0]?.assessedAt

  // Get unique domains assessed
  const domainsAssessed = new Set(recentAssessments.map((a) => a.domain.name))

  return (
    <div className="group p-4 rounded-xl border bg-white/[0.02] border-white/[0.06] hover:border-white/10 transition-all">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
          {player.photoUrl ? (
            <img
              src={player.photoUrl}
              alt={`${player.firstName} ${player.lastName}`}
              className="w-full h-full rounded-xl object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-primary">{initials}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white truncate">
              {player.firstName} {player.lastName}
            </h3>
            {age && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/[0.02] border-white/10 text-gray-400">
                {age}y
              </Badge>
            )}
          </div>

          {player.team && (
            <p className="text-xs text-gray-500 mb-2 truncate">
              {player.team.name} &middot; {player.team.sport.name}
            </p>
          )}

          {/* Domain indicators */}
          <div className="flex items-center gap-1">
            {["technical", "tactical", "physical", "psychological"].map((domain) => {
              const DomainIcon = getDomainIcon(domain)
              const isAssessed = domainsAssessed.has(domain)
              return (
                <div
                  key={domain}
                  className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center",
                    isAssessed ? "bg-white/10" : "bg-white/[0.03]"
                  )}
                  title={`${domain.charAt(0).toUpperCase() + domain.slice(1)}: ${isAssessed ? "Assessed" : "Not assessed"}`}
                >
                  <DomainIcon className={cn("w-3 h-3", isAssessed ? "text-white" : "text-gray-600")} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onAssess()
            }}
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" />
            Assess
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            className="h-8 text-xs gap-1.5 text-gray-500 hover:text-white"
          >
            View
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      {lastAssessed && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-gray-500">
          <span>Last assessed: {formatDate(lastAssessed)}</span>
          <span>{recentAssessments.length} recent assessments</span>
        </div>
      )}
    </div>
  )
}

function RecentAssessmentRow({ assessment }: { assessment: Assessment }) {
  const DomainIcon = getDomainIcon(assessment.domain.name)

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-all">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${assessment.domain.color}20` }}
      >
        <DomainIcon className="w-4 h-4" style={{ color: assessment.domain.color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {assessment.player.firstName} {assessment.player.lastName}
          </span>
          <span className="text-xs text-gray-500">&middot;</span>
          <span className="text-xs text-gray-400 truncate">{assessment.skill.name}</span>
        </div>
      </div>

      <Badge
        variant="outline"
        className="shrink-0"
        style={{
          backgroundColor: `${assessment.domain.color}15`,
          color: assessment.domain.color,
          borderColor: `${assessment.domain.color}30`,
        }}
      >
        Level {assessment.level}
      </Badge>

      <span className="text-xs text-gray-500 shrink-0">{formatDate(assessment.assessedAt)}</span>
    </div>
  )
}

export default function CoachAssessmentsOverview() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTeam, setFilterTeam] = useState<string>("all")

  // Assessment modal
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        // Fetch teams
        const teamsRes = await fetch("/api/coach/teams")
        if (!teamsRes.ok) throw new Error("Failed to fetch teams")
        const teamsData = await teamsRes.json()
        setTeams(teamsData.teams || [])

        // Fetch all players for coach's teams
        const playersRes = await fetch("/api/coach/players")
        if (!playersRes.ok) throw new Error("Failed to fetch players")
        const playersData = await playersRes.json()
        setPlayers(playersData.players || [])

        // Fetch recent assessments
        const assessmentsRes = await fetch("/api/coach/assessments?limit=20")
        if (!assessmentsRes.ok) throw new Error("Failed to fetch assessments")
        const assessmentsData = await assessmentsRes.json()
        setRecentAssessments(assessmentsData.assessments || [])

      } catch (err) {
        console.error("Error fetching data:", err)
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Refresh assessments after creating one
  const refreshAssessments = async () => {
    try {
      const res = await fetch("/api/coach/assessments?limit=20")
      if (res.ok) {
        const data = await res.json()
        setRecentAssessments(data.assessments || [])
      }
    } catch (err) {
      console.error("Error refreshing assessments:", err)
    }
  }

  // Filter players
  const filteredPlayers = players.filter((player) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const fullName = `${player.firstName} ${player.lastName}`.toLowerCase()
      if (!fullName.includes(query)) return false
    }

    // Team filter
    if (filterTeam !== "all" && player.team?.id !== filterTeam) {
      return false
    }

    return true
  })

  // Get assessments for a specific player
  const getPlayerAssessments = (playerId: string) => {
    return recentAssessments.filter((a) => a.player.id === playerId)
  }

  // Handle assessment modal
  const openAssessmentModal = (player: Player) => {
    setSelectedPlayer(player)
    setAssessmentModalOpen(true)
  }

  const handleAssessmentSuccess = () => {
    setAssessmentModalOpen(false)
    setSelectedPlayer(null)
    refreshAssessments()
  }

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
        <h3 className="text-lg font-medium text-white mb-2">Something went wrong</h3>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{players.length}</p>
              <p className="text-xs text-gray-500">Total Players</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{recentAssessments.length}</p>
              <p className="text-xs text-gray-500">Recent Assessments</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{teams.length}</p>
              <p className="text-xs text-gray-500">Teams</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">
                {new Set(recentAssessments.map((a) => a.player.id)).size}
              </p>
              <p className="text-xs text-gray-500">Players Assessed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Players List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              Players
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48 h-8 text-sm bg-white/[0.02] border-white/[0.06]"
                />
              </div>

              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-36 h-8 text-xs bg-white/[0.02] border-white/[0.06]">
                  <SelectValue placeholder="All Teams" />
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
            </div>
          </div>

          {/* Players grid */}
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No players found</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  recentAssessments={getPlayerAssessments(player.id)}
                  onClick={() => window.location.href = `/coach/assess/${player.id}`}
                  onAssess={() => openAssessmentModal(player)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            Recent Assessments
          </h2>

          {recentAssessments.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <Target className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No assessments yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Start by assessing a player
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAssessments.slice(0, 10).map((assessment) => (
                <RecentAssessmentRow key={assessment.id} assessment={assessment} />
              ))}

              {recentAssessments.length > 10 && (
                <Button
                  variant="ghost"
                  className="w-full text-sm text-gray-500 hover:text-white"
                >
                  View all assessments
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assessment Modal */}
      {selectedPlayer && (
        <PlayerAssessmentForm
          open={assessmentModalOpen}
          onOpenChange={setAssessmentModalOpen}
          player={{
            id: selectedPlayer.id,
            firstName: selectedPlayer.firstName,
            lastName: selectedPlayer.lastName,
            birthDate: selectedPlayer.birthDate,
            photoUrl: selectedPlayer.photoUrl,
          }}
          teamId={selectedPlayer.team?.id}
          sportId={selectedPlayer.team?.sport.id}
          onSuccess={handleAssessmentSuccess}
        />
      )}
    </div>
  )
}
