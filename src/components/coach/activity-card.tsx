"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Clock,
  Users,
  Star,
  ChevronDown,
  ChevronUp,
  Plus,
  Target,
  Zap,
  Dumbbell,
  Gamepad2,
  Swords,
  Snowflake,
  Smile,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"

interface Activity {
  id: string
  name: string
  slug: string
  description: string | null
  activityType: "warmup" | "technical" | "tactical" | "game" | "scrimmage" | "conditioning" | "cooldown" | "fun"
  difficulty: "beginner" | "intermediate" | "advanced"
  minPlayers: number
  maxPlayers: number | null
  durationMinutes: number
  setupInstructions: string | null
  howToPlay: string
  coachingPoints: string[] | null
  questionsToAsk: string[] | null
  commonMistakes: string[] | null
  variations: { name: string; description: string; difficulty: string }[] | null
  makeEasier: string | null
  makeHarder: string | null
  equipmentNeeded: string[] | null
  spaceRequired: string | null
  indoorSuitable: boolean
  tags: string[] | null
  featured: boolean
  usageCount: number
  averageRating: number | null
}

interface ActivityCardProps {
  activity: Activity
  onAdd?: (activity: Activity) => void
  showAddButton?: boolean
  compact?: boolean
  className?: string
}

const TYPE_CONFIG: Record<string, { icon: typeof Target; color: string; bg: string }> = {
  warmup: { icon: Zap, color: "text-orange-400", bg: "bg-orange-500/20" },
  technical: { icon: Target, color: "text-blue-400", bg: "bg-blue-500/20" },
  tactical: { icon: Lightbulb, color: "text-purple-400", bg: "bg-purple-500/20" },
  game: { icon: Gamepad2, color: "text-green-400", bg: "bg-green-500/20" },
  scrimmage: { icon: Swords, color: "text-red-400", bg: "bg-red-500/20" },
  conditioning: { icon: Dumbbell, color: "text-amber-400", bg: "bg-amber-500/20" },
  cooldown: { icon: Snowflake, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  fun: { icon: Smile, color: "text-pink-400", bg: "bg-pink-500/20" },
}

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string }> = {
  beginner: { label: "Beginner", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  intermediate: { label: "Intermediate", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  advanced: { label: "Advanced", color: "bg-red-500/20 text-red-400 border-red-500/30" },
}

function ActivityDetailModal({
  activity,
  open,
  onOpenChange,
  onAdd,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd?: (activity: Activity) => void
}) {
  const typeConfig = TYPE_CONFIG[activity.activityType] || TYPE_CONFIG.technical
  const TypeIcon = typeConfig.icon
  const difficultyConfig = DIFFICULTY_CONFIG[activity.difficulty]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0a0a0f] border-white/10">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", typeConfig.bg)}>
                <TypeIcon className={cn("w-5 h-5", typeConfig.color)} />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
                  {activity.name}
                  {activity.featured && (
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  )}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={difficultyConfig.color}>
                    {difficultyConfig.label}
                  </Badge>
                  <span className="text-xs text-gray-500 capitalize">{activity.activityType}</span>
                </div>
              </div>
            </div>
            {onAdd && (
              <Button onClick={() => onAdd(activity)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add to Session
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs">Duration</span>
              </div>
              <p className="text-sm font-medium text-white">{activity.durationMinutes} min</p>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs">Players</span>
              </div>
              <p className="text-sm font-medium text-white">
                {activity.minPlayers}{activity.maxPlayers ? `-${activity.maxPlayers}` : "+"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Target className="w-3.5 h-3.5" />
                <span className="text-xs">Space</span>
              </div>
              <p className="text-sm font-medium text-white capitalize">{activity.spaceRequired || "Any"}</p>
            </div>
          </div>

          {/* Description */}
          {activity.description && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Overview</h4>
              <p className="text-sm text-gray-300">{activity.description}</p>
            </div>
          )}

          {/* Setup */}
          {activity.setupInstructions && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Setup</h4>
              <p className="text-sm text-gray-300 bg-white/[0.02] p-3 rounded-lg border border-white/[0.06]">
                {activity.setupInstructions}
              </p>
            </div>
          )}

          {/* How to Play */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">How to Play</h4>
            <div className="text-sm text-gray-300 bg-white/[0.02] p-3 rounded-lg border border-white/[0.06] whitespace-pre-line">
              {activity.howToPlay}
            </div>
          </div>

          {/* Coaching Points */}
          {activity.coachingPoints && activity.coachingPoints.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                Coaching Points
              </h4>
              <ul className="space-y-1.5">
                {activity.coachingPoints.map((point, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions to Ask */}
          {activity.questionsToAsk && activity.questionsToAsk.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                Questions to Ask
              </h4>
              <ul className="space-y-1.5">
                {activity.questionsToAsk.map((question, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-purple-400 mt-1">?</span>
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Common Mistakes */}
          {activity.commonMistakes && activity.commonMistakes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Common Mistakes
              </h4>
              <ul className="space-y-1.5">
                {activity.commonMistakes.map((mistake, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-amber-400 mt-1">!</span>
                    {mistake}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progressions */}
          <div className="grid sm:grid-cols-2 gap-4">
            {activity.makeEasier && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <h4 className="text-sm font-medium text-green-400 mb-1.5 flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4" />
                  Make Easier
                </h4>
                <p className="text-sm text-gray-300">{activity.makeEasier}</p>
              </div>
            )}
            {activity.makeHarder && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <h4 className="text-sm font-medium text-red-400 mb-1.5 flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4" />
                  Make Harder
                </h4>
                <p className="text-sm text-gray-300">{activity.makeHarder}</p>
              </div>
            )}
          </div>

          {/* Variations */}
          {activity.variations && activity.variations.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Variations</h4>
              <div className="space-y-2">
                {activity.variations.map((variation, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">{variation.name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {variation.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400">{variation.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {activity.equipmentNeeded && activity.equipmentNeeded.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Equipment Needed</h4>
              <div className="flex flex-wrap gap-2">
                {activity.equipmentNeeded.map((item, i) => (
                  <Badge key={i} variant="outline" className="bg-white/[0.02] border-white/[0.06]">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {activity.tags && activity.tags.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06]">
              <div className="flex flex-wrap gap-1.5">
                {activity.tags.map((tag, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] bg-white/[0.02] border-white/[0.06] text-gray-500"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ActivityCard({
  activity,
  onAdd,
  showAddButton = true,
  compact = false,
  className,
}: ActivityCardProps) {
  const [detailOpen, setDetailOpen] = useState(false)

  const typeConfig = TYPE_CONFIG[activity.activityType] || TYPE_CONFIG.technical
  const TypeIcon = typeConfig.icon
  const difficultyConfig = DIFFICULTY_CONFIG[activity.difficulty]

  if (compact) {
    return (
      <>
        <div
          className={cn(
            "group p-3 rounded-lg border cursor-pointer transition-all",
            "bg-white/[0.02] border-white/[0.06] hover:border-white/10 hover:bg-white/[0.04]",
            className
          )}
          onClick={() => setDetailOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", typeConfig.bg)}>
              <TypeIcon className={cn("w-4 h-4", typeConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-white truncate">{activity.name}</h4>
                {activity.featured && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span>{activity.durationMinutes} min</span>
                <span>•</span>
                <span className="capitalize">{activity.difficulty}</span>
              </div>
            </div>
            {showAddButton && onAdd && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onAdd(activity)
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <ActivityDetailModal
          activity={activity}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onAdd={onAdd}
        />
      </>
    )
  }

  return (
    <>
      <div
        className={cn(
          "group p-4 rounded-xl border cursor-pointer transition-all",
          "bg-white/[0.02] border-white/[0.06] hover:border-white/10",
          className
        )}
        onClick={() => setDetailOpen(true)}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", typeConfig.bg)}>
            <TypeIcon className={cn("w-5 h-5", typeConfig.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-white truncate">{activity.name}</h3>
              {activity.featured && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-[10px]", difficultyConfig.color)}>
                {difficultyConfig.label}
              </Badge>
              <span className="text-xs text-gray-500 capitalize">{activity.activityType}</span>
            </div>
          </div>
        </div>

        {activity.description && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-3">{activity.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {activity.durationMinutes} min
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {activity.minPlayers}{activity.maxPlayers ? `-${activity.maxPlayers}` : "+"}
            </span>
          </div>

          {showAddButton && onAdd && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                onAdd(activity)
              }}
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      <ActivityDetailModal
        activity={activity}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onAdd={onAdd}
      />
    </>
  )
}
