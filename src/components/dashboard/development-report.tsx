"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import DomainProgressCard, { DomainProgressGrid } from "./domain-progress-card"
import DomainRadar, { type RadarAxis } from "@/components/development/domain-radar"
import RecentGlows from "./recent-glows"
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
  Sparkles,
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
    displayName: string
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
  domainDisplayName: string
  level: number
  notes: string | null
  strengths: string[]
  areasForImprovement: string[]
  coachName: string
  assessedAt: string
  context: string | null
}

interface RadarSnapshot {
  domain: string
  averageLevel: number
  previousAverageLevel: number | null
}

interface RadarPeriodEntry {
  key: string
  kind: "quarter" | "month"
  snapshots: RadarSnapshot[]
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
  snapshots: RadarSnapshot[]
  periods?: {
    current: { quarterKey: string; months: string[] }
    radar: RadarPeriodEntry[]
  }
}

const LEVEL_LABELS = ["Not Assessed", "Beginner", "Developing", "Competent", "Proficient", "Advanced"]

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const LATEST_PERIOD_KEY = "__latest__"

/** "2026-Q3" -> "Q3 2026"; "2026-09" -> "Sep 2026"; falls back to the raw key. */
function formatPeriodLabel(entry: Pick<RadarPeriodEntry, "key" | "kind">): string {
  if (entry.kind === "quarter") {
    const match = /^(\d{4})-Q([1-4])$/.exec(entry.key)
    if (match) return `Q${match[2]} ${match[1]}`
    return entry.key
  }
  const match = /^(\d{4})-(\d{2})$/.exec(entry.key)
  if (match) {
    const monthName = MONTH_NAMES[Number(match[2]) - 1] ?? match[2]
    return `${monthName} ${match[1]}`
  }
  return entry.key
}

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
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>(LATEST_PERIOD_KEY)

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

        const reportData: ReportData = await res.json()
        setData(reportData)

        // Default to the current quarter's rollup when periods are
        // available; otherwise the "Latest" sentinel drives the back-compat
        // `snapshots` field (legacy fallback / zero-UI-change floor).
        const periods = reportData.periods
        if (periods && periods.radar.length > 0) {
          const currentQuarterEntry = periods.radar.find(
            (e) => e.kind === "quarter" && e.key === periods.current.quarterKey
          )
          setSelectedPeriodKey(currentQuarterEntry?.key ?? periods.radar[0].key)
        } else {
          setSelectedPeriodKey(LATEST_PERIOD_KEY)
        }
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
        <AlertCircle className="w-10 h-10 text-ink-muted mb-3" />
        <p className="text-ink-muted">{error || "No data available"}</p>
      </div>
    )
  }

  const { overallProgress, domainProgress, recentAssessments, snapshots, periods } = data
  const TrendIcon = overallProgress.trend > 0 ? TrendingUp : overallProgress.trend < 0 ? TrendingDown : Minus
  const trendColor = overallProgress.trend > 0 ? "text-emerald-400" : overallProgress.trend < 0 ? "text-amber-500" : "text-ink-muted"
  const trendLabel = overallProgress.trend < 0 ? "finding form" : undefined

  // Period selector options: the API's radar entries (quarter rollup +
  // monthly drill-down), or a single "Latest" fallback when the child has
  // no periods data at all (legacy-only — see the reports API's back-compat
  // `snapshots` field).
  const hasPeriods = !!periods && periods.radar.length > 0
  const periodOptions = hasPeriods
    ? periods!.radar.map((entry) => ({ key: entry.key, label: formatPeriodLabel(entry) }))
    : [{ key: LATEST_PERIOD_KEY, label: "Latest" }]

  const selectedRadarEntry = hasPeriods
    ? periods!.radar.find((entry) => entry.key === selectedPeriodKey)
    : undefined
  const activeSnapshots = selectedRadarEntry ? selectedRadarEntry.snapshots : (snapshots ?? [])

  const radarAxes: RadarAxis[] = activeSnapshots.map((s) => ({
    label: s.domain,
    current: s.averageLevel,
    previous: s.previousAverageLevel ?? undefined,
  }))

  const hasAssessments = overallProgress.totalAssessments > 0

  if (compact) {
    // Compact view for sidebar or preview
    return (
      <div className={cn("space-y-4", className)}>
        {/* Overall Score */}
        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink-muted">Overall Development</span>
            {hasAssessments && (
              <div
                className={cn("flex items-center gap-1", trendColor)}
                title={trendLabel}
                aria-label={trendLabel}
              >
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
                <span className="text-3xl font-bold text-ink">
                  {overallProgress.averageLevel.toFixed(1)}
                </span>
                <span className="text-sm text-ink-muted">/ 5.0</span>
              </div>
              <div className="h-2 bg-cream-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-orange-500 rounded-full"
                  style={{ width: `${(overallProgress.averageLevel / 5) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">No assessments yet</p>
          )}
        </div>

        {/* Domain mini-cards */}
        <div className="grid grid-cols-2 gap-2">
          {domainProgress.map((domain) => (
            <div
              key={domain.domain.id}
              className="p-3 rounded-lg bg-paper border border-border"
            >
              <p className="text-xs text-ink-muted mb-1">{domain.domain.displayName}</p>
              <p className="text-lg font-bold text-ink">
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
      {/* Header Stats — these totals are all-time (never period-filtered),
          called out explicitly so they can't be misread as disagreeing
          with the period-scoped radar below. */}
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">All time</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 -mt-2">
        {/* Overall Progress */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-orange-500/10 border border-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-ink-muted">Overall Level</span>
          </div>
          {hasAssessments ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-ink">
                {overallProgress.averageLevel.toFixed(1)}
              </span>
              <span className="text-sm text-ink-muted">/ 5.0</span>
              <div
                className={cn("flex items-center gap-0.5 ml-2", trendColor)}
                title={trendLabel}
                aria-label={trendLabel}
              >
                <TrendIcon className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {overallProgress.trend > 0 ? `+${overallProgress.trend}` : overallProgress.trend}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-2xl font-bold text-ink-muted">—</span>
          )}
        </div>

        {/* Total Assessments */}
        <div className="p-5 rounded-2xl bg-paper border border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-ink-muted">Assessments</span>
          </div>
          <span className="text-3xl font-bold text-ink">{overallProgress.totalAssessments}</span>
        </div>

        {/* Domains Assessed */}
        <div className="p-5 rounded-2xl bg-paper border border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-ink-muted">Domains</span>
          </div>
          <span className="text-3xl font-bold text-ink">
            {overallProgress.domainsAssessed}
            <span className="text-lg text-ink-muted ml-1">/ 4</span>
          </span>
        </div>

        {/* Current Enrollments */}
        <div className="p-5 rounded-2xl bg-paper border border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-sm text-ink-muted">Active Teams</span>
          </div>
          <span className="text-3xl font-bold text-ink">{data.currentEnrollments.length}</span>
        </div>
      </div>

      {/* Recent Glows — quick hit of positive framing above the domain cards. */}
      <RecentGlows familyMemberId={familyMemberId} />

      {/* Domain Radar — at-a-glance shape of development across domains,
          period-aware: defaults to the current quarter's rollup, with
          monthly drill-down and prior quarters available in the selector. */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Domain Overview
          </h2>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="sr-only">Radar period</span>
            <select
              data-testid="radar-period-select"
              value={selectedPeriodKey}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
              disabled={!hasPeriods}
              className="rounded-lg border border-border bg-paper px-3 py-1.5 text-sm text-ink disabled:opacity-60"
            >
              {periodOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="p-6 rounded-2xl bg-paper border border-border">
          <DomainRadar axes={radarAxes} />
        </div>
      </section>

      {/* Domain Progress — all-time, not period-filtered (see the reports
          API: domainProgress derives straight from player_assessments). */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Development by Domain
            <span className="text-xs font-medium uppercase tracking-wide text-ink-faint ml-1">
              All time
            </span>
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
          <div className="p-8 rounded-2xl border border-dashed border-border text-center">
            <Target className="w-12 h-12 text-ink-faint mx-auto mb-3" />
            <h3 className="text-lg font-medium text-ink mb-2">No Assessments Yet</h3>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              As your child participates in practices and games, coaches will provide skill
              assessments that appear here. Check back soon!
            </p>
          </div>
        )}
      </section>

      {/* Recent Assessments Timeline */}
      {recentAssessments.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Recent Coach Assessments
          </h2>

          <div className="space-y-3">
            {recentAssessments.map((assessment) => (
              <div
                key={assessment.id}
                className="p-4 rounded-xl bg-paper border border-border hover:border-border transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Level badge */}
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-primary">{assessment.level}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-ink">{assessment.skillName}</h4>
                      <Badge variant="outline" className="text-[10px] bg-paper">
                        {assessment.domainDisplayName}
                      </Badge>
                    </div>
                    <p className="text-sm text-ink-muted mb-2">
                      {LEVEL_LABELS[assessment.level]}
                    </p>

                    {assessment.strengths.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {assessment.strengths.map((s, i) => (
                          <p key={i} className="text-sm text-emerald-600 flex items-start gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {assessment.areasForImprovement.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {assessment.areasForImprovement.map((a, i) => (
                          <p key={i} className="text-sm text-amber-600">
                            <span className="font-medium">Working on:</span> {a}
                          </p>
                        ))}
                      </div>
                    )}

                    {assessment.notes && (
                      <p className="text-sm text-ink-muted line-clamp-2">{assessment.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
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
    </div>
  )
}
