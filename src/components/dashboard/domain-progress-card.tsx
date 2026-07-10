"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Target,
  Lightbulb,
  Dumbbell,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
} from "lucide-react"

interface SkillProgress {
  skillId: string
  skillName: string
  skillDescription: string | null
  currentLevel: number
  previousLevel: number
  trend: number
  assessmentCount: number
  history: number[]
  lastAssessed: string | null
}

interface DomainProgressData {
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
  skills: SkillProgress[]
}

interface DomainProgressCardProps {
  data: DomainProgressData
  expanded?: boolean
  onToggle?: () => void
  className?: string
}

const DOMAIN_CONFIG: Record<string, { icon: typeof Target; color: string; bg: string; gradient: string }> = {
  technical: {
    icon: Target,
    color: "text-primary",
    bg: "bg-primary/10",
    gradient: "from-blue-500 to-cyan-500",
  },
  tactical: {
    icon: Lightbulb,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    gradient: "from-purple-500 to-pink-500",
  },
  physical: {
    icon: Dumbbell,
    color: "text-amber-400",
    bg: "bg-amber-500/20",
    gradient: "from-amber-500 to-orange-500",
  },
  psychological: {
    icon: Brain,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    gradient: "from-emerald-500 to-green-500",
  },
}

const LEVEL_LABELS = ["Not Assessed", "Beginner", "Developing", "Competent", "Proficient", "Advanced"]

function MiniSparkline({ data, colorClass }: { data: number[]; colorClass: string }) {
  if (data.length < 2) return null

  const max = Math.max(...data, 5)
  const min = Math.min(...data, 1)
  const range = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 80
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 100" className={cn("w-full h-full", colorClass)} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-sm"
      />
    </svg>
  )
}

function SkillRow({ skill, domainColor }: { skill: SkillProgress; domainColor: string }) {
  const TrendIcon = skill.trend > 0 ? TrendingUp : skill.trend < 0 ? TrendingDown : Minus
  const trendColor = skill.trend > 0 ? "text-emerald-400" : skill.trend < 0 ? "text-amber-500" : "text-ink-muted"
  const trendLabel = skill.trend < 0 ? "finding form" : undefined

  return (
    <div className="p-3 rounded-lg bg-paper border border-border hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="text-sm font-medium text-ink truncate">{skill.skillName}</h5>
            {skill.trend !== 0 && (
              <div
                className={cn("flex items-center gap-0.5", trendColor)}
                title={trendLabel}
                aria-label={trendLabel}
              >
                <TrendIcon className="w-3 h-3" />
                <span className="text-[10px] font-medium">
                  {skill.trend > 0 ? `+${skill.trend}` : skill.trend}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            {LEVEL_LABELS[skill.currentLevel]} • {skill.assessmentCount} assessment
            {skill.assessmentCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Level indicator */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                level <= skill.currentLevel ? domainColor.replace("text-", "bg-") : "bg-cream-3"
              )}
            />
          ))}
        </div>
      </div>

      {/* Mini sparkline for history */}
      {skill.history.length > 1 && (
        <div className="h-6 mt-2 opacity-60">
          <MiniSparkline data={skill.history} colorClass={domainColor} />
        </div>
      )}
    </div>
  )
}

export default function DomainProgressCard({
  data,
  expanded = false,
  onToggle,
  className,
}: DomainProgressCardProps) {
  const config = DOMAIN_CONFIG[data.domain.slug] || DOMAIN_CONFIG.technical
  const Icon = config.icon
  const TrendIcon = data.trend > 0 ? TrendingUp : data.trend < 0 ? TrendingDown : Minus
  const trendColor = data.trend > 0 ? "text-emerald-400" : data.trend < 0 ? "text-amber-500" : "text-ink-muted"
  const trendLabel = data.trend < 0 ? "finding form" : undefined

  const hasData = data.skillCount > 0

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all overflow-hidden",
        "bg-paper border-border",
        onToggle && "cursor-pointer hover:border-border",
        className
      )}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
            <Icon className={cn("w-6 h-6", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-ink">{data.domain.displayName}</h3>
              {onToggle && (
                <ChevronRight
                  className={cn(
                    "w-5 h-5 text-ink-muted transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              )}
            </div>

            {hasData ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl font-bold text-ink">
                    {data.averageLevel.toFixed(1)}
                  </span>
                  <span className="text-sm text-ink-muted">/ 5.0</span>
                  <div
                    className={cn("flex items-center gap-1", trendColor)}
                    title={trendLabel}
                    aria-label={trendLabel}
                  >
                    <TrendIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {data.trend > 0 ? `+${data.trend}` : data.trend === 0 ? "0" : data.trend}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative h-2 bg-cream-3 rounded-full overflow-hidden mb-2">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", config.gradient)}
                    style={{ width: `${(data.averageLevel / 5) * 100}%` }}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-ink-muted">
                  <span>{data.skillCount} skills assessed</span>
                  <span>{data.totalAssessments} total assessments</span>
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm text-ink-muted">No assessments yet</p>
                <p className="text-xs text-ink-faint mt-1">
                  Coach assessments will appear here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Skills List */}
      {expanded && hasData && (
        <div className="px-5 pb-5 pt-0 border-t border-border">
          <div className="space-y-2 mt-4">
            {data.skills.map((skill) => (
              <SkillRow key={skill.skillId} skill={skill} domainColor={config.color} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Grid layout component for all domains
export function DomainProgressGrid({
  domains,
  expandedDomain,
  onToggle,
  className,
}: {
  domains: DomainProgressData[]
  expandedDomain?: string | null
  onToggle?: (domainId: string) => void
  className?: string
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {domains.map((domain) => (
        <DomainProgressCard
          key={domain.domain.id}
          data={domain}
          expanded={expandedDomain === domain.domain.id}
          onToggle={onToggle ? () => onToggle(domain.domain.id) : undefined}
        />
      ))}
    </div>
  )
}
