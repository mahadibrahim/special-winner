"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import DomainProgressCard, { DomainProgressGrid } from "./domain-progress-card"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Award,
  Calendar,
  Loader2,
  AlertCircle,
  ChevronRight,
  Download,
  Share2,
  BarChart3,
  Clock,
  User,
} from "lucide-react"

interface DevelopmentReportProps {
  familyMemberId: string
  compact?: boolean
  className?: string
}

interface DomainProgress {
  domain: {
    id: string
    name: string
    slug: string
    description: string | null
  }
  averageLevel: number
  previousAverageLevel: number
  trend: number
  skillCount: number
  totalAssessments: number
  skills: {
    skillId: string
    skillName: string
    skillDescription: string | null
    currentLevel: number
    previousLevel: number
    trend: number
    assessmentCount: number
    history: number[]
    lastAssessed: string | null
  }[]
}

interface RecentAssessment {
  id: string
  skillName: string
  domainName: string
  level: number
  notes: string | null
  coachName: string
  assessedAt: string
  context: string | null
}

interface ReportData {
  familyMember: {
    id: string
    firstName: string
    lastName: string
    age: number
    dateOfBirth: string
  }
  currentEnrollments: {
    teamId: string
    teamName: string
    position: string | null
    sportId: string
    sportName: string
    seasonName: string
    programName: string
  }[]
  overallProgress: {
    averageLevel: number
    previousAverageLevel: number
    trend: number
    totalAssessments: number
    domainsAssessed: number
  }
  domainProgress: DomainProgress[]
  recentAssessments: RecentAssessment[]
}

const LEVEL_LABELS = ["Not Assessed", "Beginner", "Developing", "Competent", "Proficient", "Advanced"]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return formatDate(dateStr)
}

export default function DevelopmentReport({
  familyMemberId,
  compact = false,
  className,
}: DevelopmentReportProps) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      try {
        setLoading(true)
        const res = await fetch(`/api/development/reports/${familyMemberId}`)

        if (!res.ok) {
          if (res.status === 404) throw new Error("Data not found")
          if (res.status === 403) throw new Error("Access denied")
          throw new Error("Failed to load development report")
        }

        const reportData = await res.json()
        setData(reportData)
      } catch (err) {
        console.error("Error fetching report:", err)
        setError(err instanceof Error ? err.message : "Failed to load report")
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [familyMemberId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-10 h-10 text-gray-500 mb-3" />
        <p className="text-gray-400">{error || "No data available"}</p>
      </div>
    )
  }

  const { overallProgress, domainProgress, recentAssessments } = data
  const TrendIcon = overallProgress.trend > 0 ? TrendingUp : overallProgress.trend < 0 ? TrendingDown : Minus
  const trendColor = overallProgress.trend > 0 ? "text-emerald-400" : overallProgress.trend < 0 ? "text-red-400" : "text-gray-500"

  const hasAssessments = overallProgress.totalAssessments > 0

  if (compact) {
    // Compact view for sidebar or preview
    return (
      <div className={cn("space-y-4", className)}>
        {/* Overall Score */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Overall Development</span>
            {hasAssessments && (
              <div className={cn("flex items-center gap-1", trendColor)}>
                <TrendIcon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {overallProgress.trend > 0 ? `+${overallProgress.trend}` : overallProgress.trend}
                </span>
              </div>
            )}
          </div>
          {hasAssessments ? (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-bold text-white">
                  {overallProgress.averageLevel.toFixed(1)}
                </span>
                <span className="text-sm text-gray-500">/ 5.0</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-orange-500 rounded-full"
                  style={{ width: `${(overallProgress.averageLevel / 5) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No assessments yet</p>
          )}
        </div>

        {/* Domain mini-cards */}
        <div className="grid grid-cols-2 gap-2">
          {domainProgress.map((domain) => (
            <div
              key={domain.domain.id}
              className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]"
            >
              <p className="text-xs text-gray-500 mb-1">{domain.domain.name}</p>
              <p className="text-lg font-bold text-white">
                {domain.skillCount > 0 ? domain.averageLevel.toFixed(1) : "—"}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Full view
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Overall Progress */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-orange-500/10 border border-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-gray-400">Overall Level</span>
          </div>
          {hasAssessments ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                {overallProgress.averageLevel.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500">/ 5.0</span>
              <div className={cn("flex items-center gap-0.5 ml-2", trendColor)}>
                <TrendIcon className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {overallProgress.trend > 0 ? `+${overallProgress.trend}` : overallProgress.trend}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-2xl font-bold text-gray-500">—</span>
          )}
        </div>

        {/* Total Assessments */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Assessments</span>
          </div>
          <span className="text-3xl font-bold text-white">{overallProgress.totalAssessments}</span>
        </div>

        {/* Domains Assessed */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">Domains</span>
          </div>
          <span className="text-3xl font-bold text-white">
            {overallProgress.domainsAssessed}
            <span className="text-lg text-gray-500 ml-1">/ 4</span>
          </span>
        </div>

        {/* Current Enrollments */}
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-sm text-gray-400">Active Teams</span>
          </div>
          <span className="text-3xl font-bold text-white">{data.currentEnrollments.length}</span>
        </div>
      </div>

      {/* Domain Progress */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Development by Domain
          </h2>
        </div>

        {hasAssessments ? (
          <DomainProgressGrid
            domains={domainProgress}
            expandedDomain={expandedDomain}
            onToggle={(domainId) =>
              setExpandedDomain(expandedDomain === domainId ? null : domainId)
            }
          />
        ) : (
          <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center">
            <Target className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-2">No Assessments Yet</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              As your child participates in practices and games, coaches will provide skill
              assessments that appear here. Check back soon!
            </p>
          </div>
        )}
      </section>

      {/* Recent Assessments Timeline */}
      {recentAssessments.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Recent Coach Assessments
          </h2>

          <div className="space-y-3">
            {recentAssessments.map((assessment) => (
              <div
                key={assessment.id}
                className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Level badge */}
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-primary">{assessment.level}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white">{assessment.skillName}</h4>
                      <Badge variant="outline" className="text-[10px] bg-white/[0.02]">
                        {assessment.domainName}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">
                      {LEVEL_LABELS[assessment.level]}
                    </p>
                    {assessment.notes && (
                      <p className="text-sm text-gray-500 line-clamp-2">{assessment.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{assessment.coachName}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(assessment.assessedAt)}</span>
                      {assessment.context && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{assessment.context}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      {hasAssessments && (
        <div className="flex justify-center gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
          <Button variant="outline" className="gap-2">
            <Share2 className="w-4 h-4" />
            Share Progress
          </Button>
        </div>
      )}
    </div>
  )
}
