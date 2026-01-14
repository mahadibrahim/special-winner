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
    color: "text-blue-400",
    bg: "bg-blue-500/20",
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

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
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
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
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
  const trendColor = skill.trend > 0 ? "text-emerald-400" : skill.trend < 0 ? "text-red-400" : "text-gray-500"

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="text-sm font-medium text-white truncate">{skill.skillName}</h5>
            {skill.trend !== 0 && (
              <div className={cn("flex items-center gap-0.5", trendColor)}>
                <TrendIcon className="w-3 h-3" />
                <span className="text-[10px] font-medium">
                  {skill.trend > 0 ? `+${skill.trend}` : skill.trend}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">
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
                level <= skill.currentLevel ? domainColor.replace("text-", "bg-") : "bg-white/10"
              )}
            />
          ))}
        </div>
      </div>

      {/* Mini sparkline for history */}
      {skill.history.length > 1 && (
        <div className="h-6 mt-2 opacity-60">
          <MiniSparkline data={skill.history} color={domainColor.replace("text-", "#").replace("-400", "")} />
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
  const trendColor = data.trend > 0 ? "text-emerald-400" : data.trend < 0 ? "text-red-400" : "text-gray-500"

  const hasData = data.skillCount > 0

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all overflow-hidden",
        "bg-white/[0.02] border-white/[0.06]",
        onToggle && "cursor-pointer hover:border-white/10",
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
              <h3 className="font-semibold text-white">{data.domain.name}</h3>
              {onToggle && (
                <ChevronRight
                  className={cn(
                    "w-5 h-5 text-gray-500 transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              )}
            </div>

            {hasData ? (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl font-bold text-white">
                    {data.averageLevel.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-500">/ 5.0</span>
                  <div className={cn("flex items-center gap-1", trendColor)}>
                    <TrendIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {data.trend > 0 ? `+${data.trend}` : data.trend === 0 ? "0" : data.trend}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", config.gradient)}
                    style={{ width: `${(data.averageLevel / 5) * 100}%` }}
                  />
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{data.skillCount} skills assessed</span>
                  <span>{data.totalAssessments} total assessments</span>
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm text-gray-500">No assessments yet</p>
                <p className="text-xs text-gray-600 mt-1">
                  Coach assessments will appear here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Skills List */}
      {expanded && hasData && (
        <div className="px-5 pb-5 pt-0 border-t border-white/[0.06]">
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
