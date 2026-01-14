"use client"

import { useState, useMemo } from "react"
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
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  Target,
  Activity,
  Brain,
  Users,
  Dumbbell,
  Clock,
  FileText,
  Star,
  AlertCircle,
} from "lucide-react"

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

interface AssessmentHistoryProps {
  assessments: Assessment[]
  summaries?: SkillSummary[]
  domainAverages?: DomainAverage[]
  className?: string
}

const LEVEL_LABELS = ["Emerging", "Developing", "Competent", "Proficient", "Advanced"]
const LEVEL_COLORS = [
  "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-primary/20 text-primary border-primary/30",
]

const CONTEXT_LABELS: Record<string, { label: string; icon: typeof Activity }> = {
  practice: { label: "Practice", icon: Activity },
  game: { label: "Game", icon: Target },
  test: { label: "Test", icon: FileText },
  scrimmage: { label: "Scrimmage", icon: Users },
  training: { label: "Training", icon: Dumbbell },
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

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

function TrendBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return (
      <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
        <Star className="w-3 h-3" />
        New
      </Badge>
    )
  }

  const diff = current - previous
  if (diff > 0) {
    return (
      <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        <TrendingUp className="w-3 h-3" />
        +{diff}
      </Badge>
    )
  }
  if (diff < 0) {
    return (
      <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
        <TrendingDown className="w-3 h-3" />
        {diff}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
      <Minus className="w-3 h-3" />
      Same
    </Badge>
  )
}

function AssessmentCard({ assessment, expanded, onToggle }: {
  assessment: Assessment
  expanded: boolean
  onToggle: () => void
}) {
  const DomainIcon = getDomainIcon(assessment.domain.name)
  const ContextInfo = CONTEXT_LABELS[assessment.observationContext] || CONTEXT_LABELS.practice
  const ContextIcon = ContextInfo.icon

  return (
    <div className="group relative">
      {/* Timeline connector */}
      <div className="absolute left-6 top-12 bottom-0 w-px bg-white/10 group-last:hidden" />

      <div className={cn(
        "relative p-4 rounded-xl border transition-all",
        "bg-white/[0.02] border-white/[0.06] hover:border-white/10",
        expanded && "bg-white/[0.04] border-white/10"
      )}>
        {/* Timeline dot */}
        <div
          className="absolute left-6 top-6 w-3 h-3 rounded-full border-2 border-white/20 bg-[#0a0a0f] z-10"
          style={{ backgroundColor: assessment.domain.color }}
        />

        {/* Header */}
        <div className="pl-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <DomainIcon className="w-4 h-4" style={{ color: assessment.domain.color }} />
                <h4 className="font-medium text-white truncate">{assessment.skill.name}</h4>
                {assessment.skill.isCore && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] px-1.5">
                    Core
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeDate(assessment.assessedAt)}
                </span>
                <span className="flex items-center gap-1">
                  <ContextIcon className="w-3 h-3" />
                  {ContextInfo.label}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-white/10"
                  style={{
                    backgroundColor: `${assessment.domain.color}15`,
                    color: assessment.domain.color,
                    borderColor: `${assessment.domain.color}30`
                  }}
                >
                  {assessment.domain.displayName}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Level indicator */}
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={LEVEL_COLORS[assessment.level - 1]}>
                    Level {assessment.level}
                  </Badge>
                  <TrendBadge current={assessment.level} previous={assessment.previousLevel} />
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {LEVEL_LABELS[assessment.level - 1]}
                </p>
              </div>

              {/* Expand button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="p-1 h-auto text-gray-500 hover:text-white"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Expanded content */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
              {/* Level visualization */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Skill Level</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={cn(
                        "flex-1 h-2 rounded-full transition-all",
                        level <= assessment.level
                          ? "bg-gradient-to-r from-primary to-primary/70"
                          : "bg-white/10"
                      )}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                  <span>Emerging</span>
                  <span>Advanced</span>
                </div>
              </div>

              {/* Strengths */}
              {assessment.strengths && assessment.strengths.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Star className="w-3 h-3 text-emerald-400" />
                    Strengths
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {assessment.strengths.map((strength, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      >
                        {strength}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Areas for improvement */}
              {assessment.areasForImprovement && assessment.areasForImprovement.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    Areas for Improvement
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {assessment.areasForImprovement.map((area, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="bg-amber-500/10 text-amber-400 border-amber-500/20"
                      >
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {assessment.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Coach Notes
                  </p>
                  <p className="text-sm text-gray-300 bg-white/[0.02] rounded-lg p-3 border border-white/[0.06]">
                    {assessment.notes}
                  </p>
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-2">
                <span>Assessed: {formatDate(assessment.assessedAt)}</span>
                <span>Stage: {assessment.stage.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DomainOverviewCard({ domainAverage }: { domainAverage: DomainAverage }) {
  const DomainIcon = getDomainIcon(domainAverage.domain.name)

  return (
    <div
      className="p-4 rounded-xl border bg-white/[0.02] border-white/[0.06]"
      style={{ borderColor: `${domainAverage.domain.color}20` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${domainAverage.domain.color}20` }}
          >
            <DomainIcon className="w-4 h-4" style={{ color: domainAverage.domain.color }} />
          </div>
          <div>
            <h4 className="font-medium text-white text-sm">{domainAverage.domain.displayName}</h4>
            <p className="text-[10px] text-gray-500">{domainAverage.count} skills assessed</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-white">{domainAverage.averageLevel.toFixed(1)}</p>
          <p className="text-[10px] text-gray-500">avg level</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(domainAverage.averageLevel / 5) * 100}%`,
            backgroundColor: domainAverage.domain.color
          }}
        />
      </div>
    </div>
  )
}

export default function AssessmentHistory({
  assessments,
  summaries = [],
  domainAverages = [],
  className
}: AssessmentHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterDomain, setFilterDomain] = useState<string>("all")
  const [filterContext, setFilterContext] = useState<string>("all")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")

  // Get unique domains from assessments
  const uniqueDomains = useMemo(() => {
    const domains = new Map<string, { id: string; name: string; displayName: string; color: string }>()
    assessments.forEach((a) => {
      if (!domains.has(a.domain.id)) {
        domains.set(a.domain.id, a.domain)
      }
    })
    return Array.from(domains.values())
  }, [assessments])

  // Filter and sort assessments
  const filteredAssessments = useMemo(() => {
    let filtered = [...assessments]

    if (filterDomain !== "all") {
      filtered = filtered.filter((a) => a.domain.id === filterDomain)
    }

    if (filterContext !== "all") {
      filtered = filtered.filter((a) => a.observationContext === filterContext)
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.assessedAt).getTime()
      const dateB = new Date(b.assessedAt).getTime()
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB
    })

    return filtered
  }, [assessments, filterDomain, filterContext, sortOrder])

  if (assessments.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No Assessments Yet</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Assessments will appear here once coaches begin evaluating skills.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Domain Overview */}
      {domainAverages.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Domain Overview
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {domainAverages.map((avg) => (
              <DomainOverviewCard key={avg.domain.id} domainAverage={avg} />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          <span>Filter:</span>
        </div>

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

        <Select value={filterContext} onValueChange={setFilterContext}>
          <SelectTrigger className="w-36 h-8 text-xs bg-white/[0.02] border-white/[0.06]">
            <SelectValue placeholder="All Contexts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            <SelectItem value="practice">Practice</SelectItem>
            <SelectItem value="game">Game</SelectItem>
            <SelectItem value="test">Test</SelectItem>
            <SelectItem value="scrimmage">Scrimmage</SelectItem>
            <SelectItem value="training">Training</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
          <SelectTrigger className="w-32 h-8 text-xs bg-white/[0.02] border-white/[0.06]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>

        <Badge variant="outline" className="text-xs bg-white/[0.02] border-white/[0.06]">
          {filteredAssessments.length} assessment{filteredAssessments.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Assessment Timeline */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Assessment History
        </h3>

        <div className="space-y-2">
          {filteredAssessments.map((assessment) => (
            <AssessmentCard
              key={assessment.id}
              assessment={assessment}
              expanded={expandedId === assessment.id}
              onToggle={() => setExpandedId(expandedId === assessment.id ? null : assessment.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
