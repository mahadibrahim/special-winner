"use client"

import { useState } from "react"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  Trophy,
  Star,
  TrendingUp,
  ChevronRight,
  MoreHorizontal,
  Edit3,
  Camera,
  Dumbbell,
  Users,
  Award,
  MessageSquare,
  Target,
  Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import SkillProgressChart, { SkillRadarPlaceholder } from "./skill-progress-chart"
import AchievementGallery from "./achievement-gallery"
import DevelopmentReport from "./development-report"
import AchievementsDisplay from "./achievements-display"

interface Program {
  id: string
  name: string
  sport: string
  team?: string
  role?: string
  status: "active" | "upcoming" | "completed"
  startDate: Date
  endDate?: Date
  schedule?: string
  location?: string
  coach?: string
}

interface ScheduledEvent {
  id: string
  title: string
  type: "game" | "practice" | "class" | "camp"
  date: Date
  time: string
  location: string
}

interface CoachNote {
  id: string
  coachName: string
  date: Date
  category: "progress" | "achievement" | "focus" | "encouragement"
  title: string
  preview: string
}

interface ChildData {
  id: string
  firstName: string
  lastName: string
  age: number
  dateOfBirth: Date
  avatarUrl?: string
  programs: Program[]
  stats: {
    gamesPlayed: number
    practicesAttended: number
    achievementsEarned: number
    coachRating: number
  }
  skills: {
    name: string
    current: number
    previous: number
    history: number[]
  }[]
  upcomingEvents: ScheduledEvent[]
  recentNotes: CoachNote[]
  seasonHistory: {
    season: string
    program: string
    sport: string
    year: number
  }[]
}

// Mock data
const mockChild: ChildData = {
  id: "1",
  firstName: "Emma",
  lastName: "Johnson",
  age: 9,
  dateOfBirth: new Date(2016, 3, 15),
  programs: [
    {
      id: "p1",
      name: "Fall Soccer League",
      sport: "Soccer",
      team: "U10 Lightning",
      role: "Midfielder",
      status: "active",
      startDate: new Date(2025, 8, 1),
      endDate: new Date(2025, 11, 15),
      schedule: "Tue & Thu 4:00 PM, Sat 10:00 AM (games)",
      location: "Powell Sports Complex",
      coach: "Coach Mike",
    },
    {
      id: "p2",
      name: "Winter Skills Camp",
      sport: "Soccer",
      status: "upcoming",
      startDate: new Date(2025, 11, 20),
      schedule: "Mon-Fri 9:00 AM - 12:00 PM",
      location: "Aspire Training Center",
    },
  ],
  stats: {
    gamesPlayed: 8,
    practicesAttended: 24,
    achievementsEarned: 6,
    coachRating: 4.5,
  },
  skills: [
    { name: "Ball Control", current: 4, previous: 3, history: [2, 2, 3, 3, 3, 4, 4] },
    { name: "Passing", current: 3, previous: 3, history: [2, 2, 2, 3, 3, 3, 3] },
    { name: "Shooting", current: 3, previous: 2, history: [1, 2, 2, 2, 2, 3, 3] },
    { name: "Teamwork", current: 5, previous: 4, history: [3, 3, 4, 4, 4, 5, 5] },
    { name: "Game Awareness", current: 3, previous: 2, history: [1, 1, 2, 2, 2, 3, 3] },
    { name: "Stamina", current: 4, previous: 4, history: [3, 3, 3, 4, 4, 4, 4] },
  ],
  upcomingEvents: [
    { id: "e1", title: "Team Practice", type: "practice", date: new Date(Date.now() + 1000 * 60 * 60 * 3), time: "4:00 PM", location: "Powell Sports Complex - Field 3" },
    { id: "e2", title: "Game vs Dublin FC", type: "game", date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), time: "10:00 AM", location: "Dublin Recreation Center" },
    { id: "e3", title: "Team Practice", type: "practice", date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5), time: "4:00 PM", location: "Powell Sports Complex - Field 3" },
    { id: "e4", title: "Skills Camp Registration", type: "camp", date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), time: "9:00 AM", location: "Aspire Training Center" },
  ],
  recentNotes: [
    { id: "n1", coachName: "Coach Mike", date: new Date(Date.now() - 1000 * 60 * 60 * 2), category: "progress", title: "Great improvement in ball control!", preview: "Emma has been working really hard on her dribbling drills..." },
    { id: "n2", coachName: "Coach Mike", date: new Date(Date.now() - 1000 * 60 * 60 * 72), category: "focus", title: "Area to work on: Passing accuracy", preview: "We're going to focus on passing drills this week..." },
    { id: "n3", coachName: "Coach Sarah", date: new Date(Date.now() - 1000 * 60 * 60 * 168), category: "achievement", title: "Most Improved Player - October", preview: "Congratulations! Emma was selected as most improved..." },
  ],
  seasonHistory: [
    { season: "Fall 2025", program: "U10 Lightning", sport: "Soccer", year: 2025 },
    { season: "Spring 2025", program: "U9 Storm", sport: "Soccer", year: 2025 },
    { season: "Fall 2024", program: "U8 Development", sport: "Soccer", year: 2024 },
  ],
}

const sportGradients: Record<string, string> = {
  Soccer: "from-emerald-500 to-green-600",
  Basketball: "from-orange-500 to-amber-600",
  Baseball: "from-red-500 to-rose-600",
  Volleyball: "from-purple-500 to-violet-600",
}

const eventTypeColors: Record<string, string> = {
  game: "text-amber-400 bg-amber-500/10",
  practice: "text-emerald-400 bg-emerald-500/10",
  class: "text-blue-400 bg-blue-500/10",
  camp: "text-purple-400 bg-purple-500/10",
}

const noteCategories: Record<string, { color: string; icon: typeof Star }> = {
  progress: { color: "text-emerald-400", icon: TrendingUp },
  achievement: { color: "text-amber-400", icon: Award },
  focus: { color: "text-blue-400", icon: Target },
  encouragement: { color: "text-pink-400", icon: Star },
}

interface ChildProfileProps {
  childId: string
}

export default function ChildProfile({ childId }: ChildProfileProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "progress" | "schedule" | "notes" | "achievements">("overview")
  const child = mockChild // In production, fetch based on childId

  const primarySport = child.programs[0]?.sport || "Sports"
  const gradient = sportGradients[primarySport] || "from-primary to-orange-500"

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white -ml-2" asChild>
        <a href="/dashboard">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </a>
      </Button>

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
        {/* Background decorations */}
        <div className={cn("absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 bg-gradient-to-br", gradient)} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-3xl opacity-10 bg-primary" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className={cn("w-24 h-24 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br p-1", gradient)}>
                <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                  <span className="text-3xl sm:text-4xl font-bold text-white">
                    {child.firstName[0]}{child.lastName[0]}
                  </span>
                </div>
              </div>
              <button className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
                <Camera className="w-4 h-4 text-gray-400" />
              </button>
              {child.stats.coachRating >= 4.5 && (
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Star className="w-4 h-4 text-white fill-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                    {child.firstName} {child.lastName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span>Age {child.age}</span>
                    <span className="text-gray-600">•</span>
                    <span>Born {child.dateOfBirth.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </div>

              {/* Current Programs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {child.programs.filter(p => p.status === "active").map((program) => (
                  <Badge key={program.id} className="bg-white/10 text-white border-white/20">
                    {program.team || program.name}
                    {program.role && <span className="text-gray-400 ml-1">• {program.role}</span>}
                  </Badge>
                ))}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Games", value: child.stats.gamesPlayed, icon: Trophy },
                  { label: "Practices", value: child.stats.practicesAttended, icon: Dumbbell },
                  { label: "Achievements", value: child.stats.achievementsEarned, icon: Award },
                  { label: "Coach Rating", value: child.stats.coachRating.toFixed(1), icon: Star },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs text-gray-500">{stat.label}</span>
                    </div>
                    <span className="text-xl font-bold text-white">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-x-auto">
        {[
          { key: "overview", label: "Overview", icon: Users },
          { key: "progress", label: "Progress", icon: TrendingUp },
          { key: "schedule", label: "Schedule", icon: Calendar },
          { key: "notes", label: "Coach Notes", icon: MessageSquare },
          { key: "achievements", label: "Achievements", icon: Award },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
              activeTab === key
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === "overview" && (
            <>
              {/* Current Programs */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-primary" />
                  Current Programs
                </h2>
                <div className="space-y-3">
                  {child.programs.map((program) => (
                    <div
                      key={program.id}
                      className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white">{program.name}</h3>
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              program.status === "active" ? "border-emerald-500/50 text-emerald-400" :
                              program.status === "upcoming" ? "border-amber-500/50 text-amber-400" :
                              "border-gray-500/50 text-gray-400"
                            )}>
                              {program.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-400">{program.team || program.sport}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                      {program.schedule && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          {program.schedule}
                        </div>
                      )}
                      {program.location && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <MapPin className="w-3.5 h-3.5" />
                          {program.location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Development Progress Preview */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Development Progress
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("progress")} className="text-gray-400 hover:text-white">
                    View All
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <SkillProgressChart skills={child.skills.slice(0, 4)} />
              </section>
            </>
          )}

          {activeTab === "progress" && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Development Progress
                </h2>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/dashboard/children/${childId}/development`}>
                    View Full Report
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </a>
                </Button>
              </div>
              <DevelopmentReport familyMemberId={childId} />
            </section>
          )}

          {activeTab === "schedule" && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Upcoming Schedule
              </h2>
              <div className="space-y-2">
                {child.upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all"
                  >
                    <div className="text-center w-12">
                      <div className="text-[10px] font-bold text-gray-500 uppercase">
                        {event.date.toLocaleDateString("en-US", { weekday: "short" })}
                      </div>
                      <div className="text-xl font-bold text-white">
                        {event.date.getDate()}
                      </div>
                    </div>
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", eventTypeColors[event.type])}>
                      {event.type === "game" ? <Trophy className="w-5 h-5" /> :
                       event.type === "practice" ? <Dumbbell className="w-5 h-5" /> :
                       event.type === "camp" ? <Zap className="w-5 h-5" /> :
                       <Users className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{event.title}</h4>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {event.time}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "notes" && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Coach Notes
              </h2>
              <div className="space-y-3">
                {child.recentNotes.map((note) => {
                  const config = noteCategories[note.category]
                  const Icon = config.icon
                  return (
                    <div
                      key={note.id}
                      className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-white/5", config.color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-medium text-white">{note.title}</h4>
                            <span className="text-xs text-gray-500">
                              {note.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-400 mb-2">{note.preview}</p>
                          <span className="text-xs text-gray-500">{note.coachName}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {activeTab === "achievements" && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Achievements
              </h2>
              <AchievementsDisplay familyMemberId={childId} showLocked={true} />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Events Quick View */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Next Up
            </h3>
            <div className="space-y-3">
              {child.upcomingEvents.slice(0, 3).map((event) => (
                <div key={event.id} className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs", eventTypeColors[event.type])}>
                    {event.date.getDate()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{event.title}</p>
                    <p className="text-xs text-gray-500">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("schedule")} className="w-full mt-3 text-gray-400 hover:text-white">
              View Full Schedule
            </Button>
          </div>

          {/* Recent Achievements */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Recent Achievements
            </h3>
            <AchievementsDisplay familyMemberId={childId} compact limit={3} showLocked={false} />
          </div>

          {/* Season History */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="font-semibold text-white mb-4">Season History</h3>
            <div className="space-y-2">
              {child.seasonHistory.map((season, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                  <div>
                    <p className="text-sm text-white">{season.program}</p>
                    <p className="text-xs text-gray-500">{season.sport}</p>
                  </div>
                  <span className="text-xs text-gray-400">{season.season}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
