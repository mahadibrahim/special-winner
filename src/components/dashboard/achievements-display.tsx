"use client"

import { useState, useEffect } from "react"
import {
  Star,
  TrendingUp,
  Award,
  Medal,
  Target,
  Zap,
  Flame,
  Crown,
  Wrench,
  Lightbulb,
  Dumbbell,
  Brain,
  ArrowUp,
  Sparkles,
  Trophy,
  ChevronRight,
  Loader2,
  Lock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AchievementDefinition {
  id: string
  name: string
  description: string
  category: string
  icon: string
  requirement: {
    type: string
    value: number
    domain?: string
  }
}

interface UnlockedAchievement {
  achievement: AchievementDefinition
  unlockedAt: string | null
  progress: number
  total: number
}

interface LockedAchievement {
  achievement: AchievementDefinition
  progress: number
  total: number
}

interface AchievementsData {
  stats: {
    totalAssessments: number
    maxLevel: number
    domainsAssessed: number
    improvementCount: number
    achievementsUnlocked: number
    totalAchievements: number
  }
  unlocked: UnlockedAchievement[]
  locked: LockedAchievement[]
}

interface AchievementsDisplayProps {
  familyMemberId: string
  compact?: boolean
  limit?: number
  showLocked?: boolean
  className?: string
}

const ICON_MAP: Record<string, typeof Star> = {
  star: Star,
  "trending-up": TrendingUp,
  award: Award,
  medal: Medal,
  target: Target,
  zap: Zap,
  flame: Flame,
  crown: Crown,
  wrench: Wrench,
  lightbulb: Lightbulb,
  dumbbell: Dumbbell,
  brain: Brain,
  "arrow-up": ArrowUp,
  sparkles: Sparkles,
  trophy: Trophy,
}

const CATEGORY_CONFIG: Record<string, { gradient: string; bgGlow: string }> = {
  milestone: {
    gradient: "from-purple-500 to-violet-500",
    bgGlow: "bg-purple-500/20",
  },
  skill: {
    gradient: "from-blue-500 to-cyan-500",
    bgGlow: "bg-primary/10",
  },
  domain: {
    gradient: "from-emerald-500 to-green-500",
    bgGlow: "bg-emerald-500/20",
  },
  improvement: {
    gradient: "from-orange-500 to-amber-500",
    bgGlow: "bg-orange-500/20",
  },
  special: {
    gradient: "from-amber-400 to-yellow-500",
    bgGlow: "bg-amber-500/20",
  },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function AchievementCard({
  achievement,
  unlockedAt,
  progress,
  total,
  locked = false,
  compact = false,
}: {
  achievement: AchievementDefinition
  unlockedAt?: string | null
  progress: number
  total: number
  locked?: boolean
  compact?: boolean
}) {
  const Icon = ICON_MAP[achievement.icon] || Award
  const config = CATEGORY_CONFIG[achievement.category] || CATEGORY_CONFIG.milestone
  const progressPercent = Math.min((progress / total) * 100, 100)

  if (compact) {
    return (
      <div
        className={cn(
          "group relative flex items-center gap-3 p-3 rounded-xl border transition-all",
          locked
            ? "bg-cream border-border opacity-60"
            : "bg-paper border-border hover:border-border"
        )}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            locked ? "bg-cream-2" : `bg-gradient-to-br ${config.gradient}`
          )}
        >
          {locked ? (
            <Lock className="w-4 h-4 text-ink-muted" />
          ) : (
            <Icon className="w-5 h-5 text-white" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={cn("font-medium text-sm truncate", locked ? "text-ink-muted" : "text-ink")}>
            {achievement.name}
          </h4>
          {locked ? (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-cream-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-ink-faint/40 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-muted">
                {progress}/{total}
              </span>
            </div>
          ) : (
            <p className="text-xs text-ink-muted truncate">{achievement.description}</p>
          )}
        </div>
        {!locked && <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink-muted" />}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all",
        locked
          ? "bg-cream border-border"
          : "bg-paper border-border hover:scale-[1.02]"
      )}
    >
      {/* Glow effect */}
      {!locked && (
        <div
          className={cn(
            "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity",
            config.bgGlow
          )}
        />
      )}

      <div className="relative p-5">
        {/* Icon */}
        <div
          className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center mb-4",
            locked ? "bg-cream-2" : `bg-gradient-to-br ${config.gradient} shadow-lg`
          )}
        >
          {locked ? (
            <Lock className="w-6 h-6 text-ink-muted" />
          ) : (
            <Icon className="w-7 h-7 text-white" />
          )}
        </div>

        {/* Content */}
        <h4 className={cn("font-semibold mb-1", locked ? "text-ink-muted" : "text-ink")}>
          {achievement.name}
        </h4>
        <p className={cn("text-sm mb-3 line-clamp-2", locked ? "text-ink-faint" : "text-ink-muted")}>
          {achievement.description}
        </p>

        {/* Progress or date */}
        {locked ? (
          <div className="space-y-1.5">
            <div className="h-2 bg-cream-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-ink-faint/40 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-ink-faint">
              <span>Progress</span>
              <span>
                {progress}/{total}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px] border-border text-ink-muted capitalize">
              {achievement.category}
            </Badge>
            {unlockedAt && (
              <span className="text-[10px] text-ink-faint">{formatDate(unlockedAt)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AchievementsDisplay({
  familyMemberId,
  compact = false,
  limit,
  showLocked = true,
  className,
}: AchievementsDisplayProps) {
  const [data, setData] = useState<AchievementsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllLocked, setShowAllLocked] = useState(false)

  useEffect(() => {
    async function fetchAchievements() {
      try {
        setLoading(true)
        const res = await fetch(`/api/development/achievements/${familyMemberId}`)

        if (!res.ok) {
          throw new Error("Failed to load achievements")
        }

        const achievementsData = await res.json()
        setData(achievementsData)
      } catch (err) {
        console.error("Error fetching achievements:", err)
        setError(err instanceof Error ? err.message : "Failed to load achievements")
      } finally {
        setLoading(false)
      }
    }

    fetchAchievements()
  }, [familyMemberId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-8">
        <Award className="w-10 h-10 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Unable to load achievements</p>
      </div>
    )
  }

  const { unlocked, locked, stats } = data
  const displayUnlocked = limit ? unlocked.slice(0, limit) : unlocked
  const displayLocked = showAllLocked ? locked : locked.slice(0, 3)

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {displayUnlocked.length > 0 ? (
          displayUnlocked.map((item) => (
            <AchievementCard
              key={item.achievement.id}
              achievement={item.achievement}
              unlockedAt={item.unlockedAt}
              progress={item.progress}
              total={item.total}
              compact
            />
          ))
        ) : (
          <div className="text-center py-4">
            <Award className="w-8 h-8 text-ink-faint mx-auto mb-2" />
            <p className="text-xs text-ink-muted">No achievements yet</p>
          </div>
        )}
        {unlocked.length > (limit || 0) && (
          <Button variant="ghost" className="w-full text-ink-muted hover:text-ink text-sm" asChild>
            <a href={`/dashboard/children/${familyMemberId}?tab=achievements`}>
              View All {unlocked.length} Achievements
              <ChevronRight className="w-4 h-4 ml-1" />
            </a>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Stats Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-semibold text-ink">
              {stats.achievementsUnlocked}
              <span className="text-ink-muted font-normal">/{stats.totalAchievements}</span>
            </span>
          </div>
          <span className="text-sm text-ink-muted">achievements unlocked</span>
        </div>
      </div>

      {/* Unlocked Achievements */}
      {displayUnlocked.length > 0 ? (
        <section>
          <h3 className="text-sm font-medium text-ink-muted mb-3">Unlocked</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayUnlocked.map((item) => (
              <AchievementCard
                key={item.achievement.id}
                achievement={item.achievement}
                unlockedAt={item.unlockedAt}
                progress={item.progress}
                total={item.total}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-12 px-6 rounded-2xl bg-paper border border-border">
          <Award className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">Start Your Journey</h3>
          <p className="text-sm text-ink-muted max-w-md mx-auto">
            Achievements are unlocked as you receive coach assessments and improve your skills. Keep
            practicing!
          </p>
        </div>
      )}

      {/* Locked Achievements (In Progress) */}
      {showLocked && locked.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-ink-muted mb-3">In Progress</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayLocked.map((item) => (
              <AchievementCard
                key={item.achievement.id}
                achievement={item.achievement}
                progress={item.progress}
                total={item.total}
                locked
              />
            ))}
          </div>
          {locked.length > 3 && !showAllLocked && (
            <Button
              variant="ghost"
              className="w-full mt-4 text-ink-muted hover:text-ink"
              onClick={() => setShowAllLocked(true)}
            >
              Show {locked.length - 3} More Locked Achievements
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </section>
      )}
    </div>
  )
}
