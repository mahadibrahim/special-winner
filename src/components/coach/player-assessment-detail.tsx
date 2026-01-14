"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Plus,
  User,
  Target,
  Activity,
  Brain,
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Star,
} from "lucide-react"

interface PlayerData {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  photoUrl: string | null
}

interface Assessment {
  id: string
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
  skill: {
    id: string
    name: string
    slug?: string
    description?: string
    isCore?: boolean
  }
  domain: {
    id: string
    name: string
    displayName: string
    color: string
    icon?: string
  }
  stage: {
    id: string
    name: string
    slug?: string
  }
}

interface SkillSummary {
  id: string
  skillId: string
  currentLevel: number
  highestLevel: number
  assessmentCount: number
  trend: "improving" | "stable" | "declining" | "new"
  firstAssessedAt: string
  lastAssessedAt: string
  skill: {
    id: string
    name: string
    slug?: string
    isCore?: boolean
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
}

interface DomainAverage {
  domain: {
    id: string
    name: string
    displayName: string
    color: string
  }
  totalLevel: number
  count: number
  averageLevel: number
}

interface PlayerAssessmentDetailProps {
  playerId: string
  teamId?: string
  sportId?: string
}

const DOMAIN_ICONS: Record<string, typeof Target> = {
  technical: Target,
  tactical: Brain,
  physical: Dumbbell,
  psychological: Activity,
}

const TREND_CONFIG = {
  improving: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Improving" },
  stable: { icon: Minus, color: "text-gray-400", bg: "bg-gray-500/20", label: "Stable" },
  declining: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/20", label: "Declining" },
  new: { icon: Star, color: "text-purple-400", bg: "bg-purple-500/20", label: "New" },
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

function SkillSummaryCard({ summary }: { summary: SkillSummary }) {
  const DomainIcon = getDomainIcon(summary.domain.name)
  const trendConfig = TREND_CONFIG[summary.trend]
  const TrendIcon = trendConfig.icon

  const levelLabels = ["Emerging", "Developing", "Competent", "Proficient", "Advanced"]

  return (
    <div className="p-4 rounded-xl border bg-white/[0.02] border-white/[0.06] hover:border-white/10 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${summary.domain.color}20` }}
          >
            <DomainIcon className="w-4 h-4" style={{ color: summary.domain.color }} />
          </div>
          <div>
            <h4 className="font-medium text-white text-sm flex items-center gap-1.5">
              {summary.skill.name}
              {summary.skill.isCore && (
                <Star className="w-3 h-3 text-amber-400" fill="currentColor" />
              )}
            </h4>
            <p className="text-[10px] text-gray-500">{summary.stage.name}</p>
          </div>
        </div>

        <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs", trendConfig.bg, trendConfig.color)}>
          <TrendIcon className="w-3 h-3" />
          {trendConfig.label}
        </div>
      </div>

      {/* Level display */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">{summary.currentLevel}</span>
          <span className="text-xs text-gray-500">/ 5</span>
          <span className="text-xs text-gray-400 ml-auto">{levelLabels[summary.currentLevel - 1]}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(summary.currentLevel / 5) * 100}%`,
            backgroundColor: summary.domain.color,
          }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>{summary.assessmentCount} assessments</span>
        <span>Highest: {summary.highestLevel}</span>
      </div>
    </div>
  )
}

export default function PlayerAssessmentDetail({
  playerId,
  teamId,
  sportId,
}: PlayerAssessmentDetailProps) {
  const [player, setPlayer] = useState<PlayerData | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [summaries, setSummaries] = useState<SkillSummary[]>([])
  const [domainAverages, setDomainAverages] = useState<DomainAverage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Assessment modal
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false)

  // View mode
  const [viewMode, setViewMode] = useState<"overview" | "history">("overview")
  const [filterDomain, setFilterDomain] = useState<string>("all")

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/coach/players/${playerId}/assessments`)
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Failed to fetch assessments")
        }

        const data = await res.json()
        setPlayer(data.player)
        setAssessments(data.assessments || [])
        setSummaries(data.summaries || [])
        setDomainAverages(data.domainAverages || [])
      } catch (err) {
        console.error("Error fetching data:", err)
        setError(err instanceof Error ? err.message : "An error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [playerId])

  // Refresh after assessment
  const refreshData = async () => {
    try {
      const res = await fetch(`/api/coach/players/${playerId}/assessments`)
      if (res.ok) {
        const data = await res.json()
        setAssessments(data.assessments || [])
        setSummaries(data.summaries || [])
        setDomainAverages(data.domainAverages || [])
      }
    } catch (err) {
      console.error("Error refreshing:", err)
    }
  }

  const handleAssessmentSuccess = () => {
    setAssessmentModalOpen(false)
    refreshData()
  }

  // Filter summaries by domain
  const filteredSummaries = filterDomain === "all"
    ? summaries
    : summaries.filter((s) => s.domain.id === filterDomain)

  // Get unique domains
  const uniqueDomains = Array.from(
    new Map(summaries.map((s) => [s.domain.id, s.domain])).values()
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !player) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Something went wrong</h3>
        <p className="text-sm text-gray-500">{error || "Player not found"}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.href = "/coach/assessments"}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Assessments
        </Button>
      </div>
    )
  }

  const age = calculateAge(player.birthDate)
  const initials = `${player.firstName[0]}${player.lastName[0]}`

  return (
    <div className="space-y-8">
      {/* Player Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
          {player.photoUrl ? (
            <img
              src={player.photoUrl}
              alt={`${player.firstName} ${player.lastName}`}
              className="w-full h-full rounded-2xl object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold text-primary">{initials}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {player.firstName} {player.lastName}
            </h1>
            {age && (
              <Badge variant="outline" className="w-fit bg-white/[0.02] border-white/10 text-gray-400">
                {age} years old
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Target className="w-4 h-4" />
              {summaries.length} skills tracked
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4" />
              {assessments.length} total assessments
            </span>
            {assessments[0] && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Last assessed: {new Date(assessments[0].assessedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <Button
          onClick={() => setAssessmentModalOpen(true)}
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Assessment
        </Button>
      </div>

      {/* Domain Overview Cards */}
      {domainAverages.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {domainAverages.map((avg) => {
            const DomainIcon = getDomainIcon(avg.domain.name)
            return (
              <div
                key={avg.domain.id}
                className="p-4 rounded-xl border bg-white/[0.02] border-white/[0.06]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${avg.domain.color}20` }}
                    >
                      <DomainIcon className="w-5 h-5" style={{ color: avg.domain.color }} />
                    </div>
                    <div>
                      <h3 className="font-medium text-white text-sm">{avg.domain.displayName}</h3>
                      <p className="text-[10px] text-gray-500">{avg.count} skills</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-white">{avg.averageLevel.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">/ 5</span>
                </div>

                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(avg.averageLevel / 5) * 100}%`,
                      backgroundColor: avg.domain.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View Toggle & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "overview" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("overview")}
            className={cn(
              "h-8 text-xs",
              viewMode !== "overview" && "bg-white/[0.02] border-white/[0.06]"
            )}
          >
            Skill Overview
          </Button>
          <Button
            variant={viewMode === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("history")}
            className={cn(
              "h-8 text-xs",
              viewMode !== "history" && "bg-white/[0.02] border-white/[0.06]"
            )}
          >
            Assessment History
          </Button>
        </div>

        {viewMode === "overview" && (
          <Select value={filterDomain} onValueChange={setFilterDomain}>
            <SelectTrigger className="w-40 h-8 text-xs bg-white/[0.02] border-white/[0.06]">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {uniqueDomains.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {viewMode === "overview" ? (
        <>
          {filteredSummaries.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <Target className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-2">No Skills Assessed Yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
                Start assessing {player.firstName}'s skills to track their development progress.
              </p>
              <Button onClick={() => setAssessmentModalOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add First Assessment
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSummaries.map((summary) => (
                <SkillSummaryCard key={summary.id} summary={summary} />
              ))}
            </div>
          )}
        </>
      ) : (
        <AssessmentHistory
          assessments={assessments}
          summaries={summaries}
          domainAverages={domainAverages}
        />
      )}

      {/* Assessment Modal */}
      <PlayerAssessmentForm
        open={assessmentModalOpen}
        onOpenChange={setAssessmentModalOpen}
        player={player}
        teamId={teamId}
        sportId={sportId}
        onSuccess={handleAssessmentSuccess}
      />
    </div>
  )
}
