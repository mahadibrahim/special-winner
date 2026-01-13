"use client"

import { useState } from "react"
import {
  ChevronRight,
  Star,
  TrendingUp,
  Award,
  MoreHorizontal,
  Plus,
  Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Program {
  id: string
  name: string
  sport: string
  team?: string
  role?: string
  status: "active" | "upcoming" | "completed"
}

interface SkillAssessment {
  skill: string
  level: number // 1-5
  trend: "up" | "stable" | "new"
}

interface Child {
  id: string
  firstName: string
  lastName: string
  age: number
  avatarUrl?: string
  programs: Program[]
  recentAchievement?: string
  skillAssessments: SkillAssessment[]
  coachRating?: number // 1-5
  nextEvent?: {
    title: string
    date: string
  }
}

// Mock data
const mockChildren: Child[] = [
  {
    id: "1",
    firstName: "Emma",
    lastName: "Johnson",
    age: 9,
    programs: [
      { id: "p1", name: "Fall Soccer League", sport: "Soccer", team: "U10 Lightning", status: "active" },
      { id: "p2", name: "Winter Skills Camp", sport: "Soccer", status: "upcoming" },
    ],
    recentAchievement: "Most Improved Player - October",
    skillAssessments: [
      { skill: "Ball Control", level: 4, trend: "up" },
      { skill: "Teamwork", level: 5, trend: "stable" },
      { skill: "Game Awareness", level: 3, trend: "up" },
      { skill: "Stamina", level: 4, trend: "stable" },
    ],
    coachRating: 4.5,
    nextEvent: { title: "Practice", date: "Today, 4:00 PM" },
  },
  {
    id: "2",
    firstName: "Jake",
    lastName: "Johnson",
    age: 11,
    programs: [
      { id: "p3", name: "Youth Basketball League", sport: "Basketball", team: "U12 Hawks", status: "active" },
    ],
    skillAssessments: [
      { skill: "Shooting", level: 3, trend: "up" },
      { skill: "Defense", level: 4, trend: "stable" },
      { skill: "Court Vision", level: 3, trend: "new" },
      { skill: "Hustle", level: 5, trend: "stable" },
    ],
    coachRating: 4.2,
    nextEvent: { title: "Game vs. Dublin Thunder", date: "Saturday, 10:00 AM" },
  },
]

const sportColors: Record<string, string> = {
  Soccer: "from-emerald-500 to-green-600",
  Basketball: "from-orange-500 to-amber-600",
  Baseball: "from-red-500 to-rose-600",
  Volleyball: "from-purple-500 to-violet-600",
  Football: "from-amber-600 to-yellow-600",
}

function SkillBar({ level, trend }: { level: number; trend: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-orange-500 rounded-full transition-all duration-500"
          style={{ width: `${(level / 5) * 100}%` }}
        />
      </div>
      {trend === "up" && (
        <TrendingUp className="w-3 h-3 text-emerald-400" />
      )}
      {trend === "new" && (
        <Sparkles className="w-3 h-3 text-amber-400" />
      )}
    </div>
  )
}

function ChildCard({ child }: { child: Child }) {
  const [expanded, setExpanded] = useState(false)
  const primarySport = child.programs[0]?.sport || "Sports"
  const gradientClass = sportColors[primarySport] || "from-primary to-orange-500"

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all">
      {/* Gradient accent bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", gradientClass)} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar */}
          <div className={cn(
            "relative w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shadow-lg",
            gradientClass
          )}>
            {child.firstName[0]}{child.lastName[0]}
            {child.coachRating && child.coachRating >= 4.5 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
                <Star className="w-3 h-3 text-white fill-white" />
              </div>
            )}
          </div>

          {/* Name & Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-lg">
                {child.firstName}
              </h3>
              <span className="text-sm text-gray-500">
                Age {child.age}
              </span>
            </div>
            {child.nextEvent && (
              <p className="text-sm text-gray-400 mt-0.5">
                Next: <span className="text-white">{child.nextEvent.title}</span>
                <span className="text-gray-600"> • </span>
                <span className="text-primary">{child.nextEvent.date}</span>
              </p>
            )}
          </div>

          {/* Actions */}
          <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white -mr-2">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>

        {/* Programs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {child.programs.map((program) => (
            <Badge
              key={program.id}
              variant="outline"
              className={cn(
                "border-white/10 text-xs font-medium",
                program.status === "active" ? "text-white bg-white/5" : "text-gray-500"
              )}
            >
              {program.team || program.name}
              {program.status === "upcoming" && (
                <span className="ml-1 text-amber-400">• Soon</span>
              )}
            </Badge>
          ))}
        </div>

        {/* Achievement Banner */}
        {child.recentAchievement && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm text-amber-200">{child.recentAchievement}</span>
          </div>
        )}

        {/* Skills Preview */}
        <div className="space-y-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Development Progress
            </span>
            <ChevronRight className={cn(
              "w-4 h-4 text-gray-600 transition-transform",
              expanded && "rotate-90"
            )} />
          </button>

          <div className={cn(
            "grid gap-3 overflow-hidden transition-all",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}>
            <div className="overflow-hidden">
              {child.skillAssessments.map((assessment) => (
                <div key={assessment.skill} className="flex items-center gap-3 py-2">
                  <span className="text-sm text-gray-400 w-28 truncate">
                    {assessment.skill}
                  </span>
                  <div className="flex-1">
                    <SkillBar level={assessment.level} trend={assessment.trend} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!expanded && (
            <div className="flex gap-1">
              {child.skillAssessments.slice(0, 4).map((_, i) => (
                <div key={i} className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary/60 to-orange-500/60 rounded-full"
                    style={{ width: `${(child.skillAssessments[i].level / 5) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/[0.06]">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-gray-400 hover:text-white hover:bg-white/5"
          >
            View Profile
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-gray-400 hover:text-white hover:bg-white/5"
          >
            Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary hover:bg-primary/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ChildrenOverview() {
  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Your Athletes</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {mockChildren.length} registered {mockChildren.length === 1 ? "child" : "children"}
          </p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Child
        </Button>
      </div>

      {/* Children Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {mockChildren.map((child) => (
          <ChildCard key={child.id} child={child} />
        ))}
      </div>

      {/* Empty State */}
      {mockChildren.length === 0 && (
        <div className="text-center py-12 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] border-dashed">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Add Your First Child</h3>
          <p className="text-gray-500 text-sm mb-4 max-w-sm mx-auto">
            Register your children to start signing them up for programs and tracking their progress.
          </p>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Child
          </Button>
        </div>
      )}
    </div>
  )
}
