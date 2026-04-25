"use client"

import { useEffect, useState } from "react"
import {
  Calendar,
  MapPin,
  Clock,
  ChevronRight,
  Trophy,
  Dumbbell,
  Users,
  Zap,
  Filter
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type EventType = "game" | "practice" | "class" | "camp"

interface ScheduledEvent {
  id: string
  title: string
  type: EventType
  date: Date
  time: string
  duration: string
  location: string
  child: {
    name: string
    avatar?: string
  }
  sport: string
  team?: string
  isNext?: boolean
}

interface RegistrationApiRow {
  id: string
  status: string
  familyMember: { firstName: string; lastName: string }
  season: {
    id: string
    name: string
    startDate: string
    endDate: string
    scheduleNotes: string | null
  }
  program: { name: string }
  sport: { name: string }
  location?: { name: string; city: string | null }
}

// Parses a YYYY-MM-DD string in the viewer's local timezone so season dates
// don't drift by a day when a UTC-midnight Date crosses into yesterday.
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function registrationsToEvents(rows: RegistrationApiRow[]): ScheduledEvent[] {
  const now = Date.now()
  const events: ScheduledEvent[] = []
  for (const r of rows) {
    if (r.status === "cancelled") continue
    const date = parseLocalDate(r.season.startDate)
    if (date.getTime() < now) continue
    const locationName = r.location
      ? r.location.city && r.location.city.toLowerCase() !== r.location.name.toLowerCase()
        ? `${r.location.name}, ${r.location.city}`
        : r.location.name
      : "Location TBD"
    events.push({
      id: r.id,
      title: `${r.program.name} — ${r.season.name}`,
      type: "class",
      date,
      time: r.season.scheduleNotes ?? "Schedule coming soon",
      duration: "Season begins",
      location: locationName,
      child: { name: `${r.familyMember.firstName} ${r.familyMember.lastName}` },
      sport: r.sport.name,
    })
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime())
  if (events.length > 0) events[0].isNext = true
  return events
}

const eventTypeConfig: Record<EventType, { icon: typeof Trophy; color: string; bg: string }> = {
  game: {
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-amber-500/20 border-amber-500/30"
  },
  practice: {
    icon: Dumbbell,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20 border-emerald-500/30"
  },
  class: {
    icon: Users,
    color: "text-primary",
    bg: "bg-primary/10 border-primary/20"
  },
  camp: {
    icon: Zap,
    color: "text-purple-400",
    bg: "bg-purple-500/20 border-purple-500/30"
  },
}

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return "Starting soon"
  if (diffHours < 24) return `In ${diffHours} hour${diffHours > 1 ? "s" : ""}`
  if (diffDays === 1) return "Tomorrow"
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" })
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDayOfWeek(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
}

function formatDayNumber(date: Date): string {
  return date.getDate().toString()
}

export default function UpcomingEvents() {
  const [events, setEvents] = useState<ScheduledEvent[]>([])
  const [filter, setFilter] = useState<EventType | "all">("all")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/registrations")
        if (!cancelled && res.ok) {
          const data = await res.json()
          setEvents(registrationsToEvents(data.registrations ?? []))
        }
      } catch (err) {
        console.error("Failed to load upcoming events:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredEvents = filter === "all"
    ? events
    : events.filter(e => e.type === filter)

  const nextEvent = events.find(e => e.isNext)

  if (events.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Upcoming Events
        </h2>
        <div className="text-center py-10 px-6 rounded-2xl bg-paper border border-border">
          <Calendar className="w-10 h-10 text-ink-faint mx-auto mb-3" />
          <h3 className="text-ink font-medium mb-1">No events scheduled yet</h3>
          <p className="text-sm text-ink-muted mb-4">
            Practice times, games, and camps will appear here once your child is registered.
          </p>
          <Button asChild size="sm">
            <a href="/programs">Browse programs</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Upcoming Events
          </h2>
          <p className="text-sm text-ink-muted mt-0.5">
            {events.length} upcoming {events.length === 1 ? "event" : "events"}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink gap-1">
          <Filter className="w-4 h-4" />
          Filter
        </Button>
      </div>

      {/* Next Up - Hero Card */}
      {nextEvent && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative p-6">
            <div className="flex items-start justify-between mb-4">
              <Badge className="bg-primary/30 text-primary border-primary/50 font-medium">
                Up Next
              </Badge>
              <span className="text-sm font-medium text-primary">
                {formatRelativeDate(nextEvent.date)}
              </span>
            </div>

            <div className="flex gap-5">
              {/* Date Block */}
              <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-cream-3 backdrop-blur-sm border border-border flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-ink-muted tracking-wider">
                  {formatDayOfWeek(nextEvent.date)}
                </span>
                <span className="text-2xl font-bold text-ink leading-none">
                  {formatDayNumber(nextEvent.date)}
                </span>
              </div>

              {/* Event Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-ink mb-1">
                  {nextEvent.title}
                </h3>
                <div className="flex items-center gap-3 text-sm text-ink-muted mb-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {nextEvent.time}
                  </span>
                  <span className="text-ink-faint">•</span>
                  <span>{nextEvent.duration}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="text-ink-muted truncate">{nextEvent.location}</span>
                </div>
              </div>

              {/* Child Badge */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-primary/25">
                  {nextEvent.child.name[0]}
                </div>
              </div>
            </div>

            {/* Quick Action */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border text-ink-muted text-xs">
                  {nextEvent.sport}
                </Badge>
                {nextEvent.team && (
                  <Badge variant="outline" className="border-border text-ink-muted text-xs">
                    {nextEvent.team}
                  </Badge>
                )}
              </div>
              <Button asChild size="sm" variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 gap-1">
                <a href={`/dashboard/registrations/${nextEvent.id}`}>
                  View Details
                  <ChevronRight className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Event Type Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: "all", label: "All Events" },
          { key: "game", label: "Games" },
          { key: "practice", label: "Practice" },
          { key: "camp", label: "Camps" },
          { key: "class", label: "Classes" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as EventType | "all")}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
              filter === key
                ? "bg-cream-3 text-ink border border-border"
                : "text-ink-muted hover:text-ink-2 hover:bg-cream-2"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Events Timeline */}
      <div className="space-y-3">
        {filteredEvents.slice(1).map((event, index) => {
          const config = eventTypeConfig[event.type]
          const Icon = config.icon

          return (
            <a
              key={event.id}
              href={`/dashboard/registrations/${event.id}`}
              className="group relative flex gap-4 p-4 rounded-xl bg-paper border border-border hover:bg-cream-2 hover:border-border transition-all cursor-pointer"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Date Column */}
              <div className="flex-shrink-0 w-12 text-center">
                <span className="text-[10px] font-bold text-ink-muted tracking-wider block">
                  {formatDayOfWeek(event.date)}
                </span>
                <span className="text-xl font-bold text-ink leading-tight">
                  {formatDayNumber(event.date)}
                </span>
              </div>

              {/* Event Type Icon */}
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center",
                config.bg
              )}>
                <Icon className={cn("w-5 h-5", config.color)} />
              </div>

              {/* Event Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium text-ink group-hover:text-primary transition-colors">
                      {event.title}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-ink-muted mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{event.time}</span>
                      <span className="text-ink-faint">•</span>
                      <span>{event.duration}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink-muted bg-cream-2 px-2 py-1 rounded-md">
                      {event.child.name}
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink-muted group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-ink-faint">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{event.location}</span>
                </div>
              </div>
            </a>
          )
        })}
      </div>

      {/* View All Link */}
      <div className="text-center pt-2">
        <Button asChild variant="ghost" className="text-ink-muted hover:text-ink gap-2">
          <a href="/dashboard/schedule">
            View Full Schedule
            <ChevronRight className="w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
