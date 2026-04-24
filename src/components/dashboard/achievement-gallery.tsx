"use client"

import { useState } from "react"
import {
  Trophy,
  Star,
  Zap,
  Target,
  Flame,
  Medal,
  Award,
  Crown,
  Heart,
  Users,
  ChevronRight
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AchievementCategory = "skill" | "effort" | "teamwork" | "milestone" | "special"

interface Achievement {
  id: string
  title: string
  description: string
  category: AchievementCategory
  earnedDate: Date
  sport?: string
  program?: string
  isNew?: boolean
  rarity?: "common" | "rare" | "epic" | "legendary"
}

const categoryConfig: Record<AchievementCategory, {
  icon: typeof Trophy
  gradient: string
  bgGlow: string
}> = {
  skill: {
    icon: Target,
    gradient: "from-blue-500 to-cyan-500",
    bgGlow: "bg-primary/10",
  },
  effort: {
    icon: Flame,
    gradient: "from-orange-500 to-amber-500",
    bgGlow: "bg-orange-500/20",
  },
  teamwork: {
    icon: Users,
    gradient: "from-emerald-500 to-green-500",
    bgGlow: "bg-emerald-500/20",
  },
  milestone: {
    icon: Medal,
    gradient: "from-purple-500 to-violet-500",
    bgGlow: "bg-purple-500/20",
  },
  special: {
    icon: Crown,
    gradient: "from-amber-400 to-yellow-500",
    bgGlow: "bg-amber-500/20",
  },
}

const rarityConfig: Record<string, { border: string; glow: string; label: string }> = {
  common: { border: "border-gray-500/30", glow: "", label: "Common" },
  rare: { border: "border-blue-500/50", glow: "shadow-blue-500/20 shadow-lg", label: "Rare" },
  epic: { border: "border-purple-500/50", glow: "shadow-purple-500/20 shadow-lg", label: "Epic" },
  legendary: { border: "border-amber-500/50", glow: "shadow-amber-500/30 shadow-xl", label: "Legendary" },
}

// Real data wiring pending. Empty array surfaces the empty state below
// rather than showing fictional achievements to real parents.
const mockAchievements: Achievement[] = []

function AchievementCard({ achievement, compact = false }: { achievement: Achievement; compact?: boolean }) {
  const config = categoryConfig[achievement.category]
  const rarity = rarityConfig[achievement.rarity || "common"]
  const Icon = config.icon

  if (compact) {
    return (
      <div className={cn(
        "group relative flex items-center gap-3 p-3 rounded-xl bg-paper border transition-all cursor-pointer hover:bg-cream-2",
        rarity.border,
        rarity.glow
      )}>
        {achievement.isNew && (
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
        )}
        <div className={cn(
          "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
          config.gradient
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-ink text-sm truncate">{achievement.title}</h4>
          <p className="text-xs text-ink-muted truncate">{achievement.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink-muted transition-colors" />
      </div>
    )
  }

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl bg-paper border transition-all cursor-pointer hover:scale-[1.02]",
      rarity.border,
      rarity.glow
    )}>
      {/* Glow effect */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity",
        config.bgGlow
      )} />

      {/* New indicator */}
      {achievement.isNew && (
        <div className="absolute top-3 right-3 z-10">
          <Badge className="bg-primary/80 text-white text-[10px] px-1.5">NEW</Badge>
        </div>
      )}

      <div className="relative p-5">
        {/* Icon */}
        <div className={cn(
          "w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4 shadow-lg",
          config.gradient
        )}>
          <Icon className="w-7 h-7 text-white" />
        </div>

        {/* Content */}
        <h4 className="font-semibold text-ink mb-1">{achievement.title}</h4>
        <p className="text-sm text-ink-muted mb-3 line-clamp-2">{achievement.description}</p>

        {/* Meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {achievement.sport && (
              <Badge variant="outline" className="border-border text-ink-muted text-[10px]">
                {achievement.sport}
              </Badge>
            )}
            <Badge variant="outline" className={cn(
              "text-[10px]",
              achievement.rarity === "legendary" ? "border-amber-500/50 text-amber-400" :
              achievement.rarity === "epic" ? "border-purple-500/50 text-purple-400" :
              achievement.rarity === "rare" ? "border-blue-500/50 text-primary" :
              "border-border text-ink-muted"
            )}>
              {rarity.label}
            </Badge>
          </div>
          <span className="text-[10px] text-ink-faint">
            {achievement.earnedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  )
}

interface AchievementGalleryProps {
  achievements?: Achievement[]
  compact?: boolean
  limit?: number
  showViewAll?: boolean
}

export default function AchievementGallery({
  achievements = mockAchievements,
  compact = false,
  limit,
  showViewAll = false
}: AchievementGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | "all">("all")

  const filteredAchievements = selectedCategory === "all"
    ? achievements
    : achievements.filter(a => a.category === selectedCategory)

  const displayedAchievements = limit
    ? filteredAchievements.slice(0, limit)
    : filteredAchievements

  if (compact) {
    if (displayedAchievements.length === 0) {
      return (
        <div className="text-center py-8 px-4 rounded-xl bg-paper border border-border">
          <Award className="w-8 h-8 text-ink-faint mx-auto mb-2" />
          <h4 className="text-ink font-medium text-sm mb-1">No achievements yet</h4>
          <p className="text-xs text-ink-muted">
            Achievements will appear here as your child earns them.
          </p>
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {displayedAchievements.map((achievement) => (
          <AchievementCard key={achievement.id} achievement={achievement} compact />
        ))}
        {showViewAll && achievements.length > (limit || 0) && (
          <Button variant="ghost" className="w-full text-ink-muted hover:text-ink mt-2">
            View All {achievements.length} Achievements
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "all", label: "All", icon: Award },
          { key: "skill", label: "Skills", icon: Target },
          { key: "effort", label: "Effort", icon: Flame },
          { key: "teamwork", label: "Teamwork", icon: Users },
          { key: "milestone", label: "Milestones", icon: Medal },
          { key: "special", label: "Special", icon: Crown },
        ].map(({ key, label, icon: FilterIcon }) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key as AchievementCategory | "all")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
              selectedCategory === key
                ? "bg-cream-3 text-ink border border-border"
                : "text-ink-muted hover:text-ink-2 hover:bg-cream-2"
            )}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Achievements Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayedAchievements.map((achievement) => (
          <AchievementCard key={achievement.id} achievement={achievement} />
        ))}
      </div>

      {/* Empty State */}
      {displayedAchievements.length === 0 && (
        <div className="text-center py-12 px-6 rounded-2xl bg-paper border border-border">
          <Award className="w-12 h-12 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">No achievements yet</h3>
          <p className="text-sm text-ink-muted">
            Achievements are earned through participation, effort, and growth.
          </p>
        </div>
      )}
    </div>
  )
}
