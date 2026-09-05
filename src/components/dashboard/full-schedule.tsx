"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Calendar,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  Grid3X3,
  User,
  ExternalLink,
  Download,
  Trophy,
  Users,
  Dumbbell,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { cn } from "@/lib/utils"
import type { FamilyScheduleEvent } from "@/lib/dashboard/schedule-events"

type EventType = "class" | "game" | "practice" | "tournament"
type ViewMode = "month" | "week" | "list"

interface ScheduleEvent {
  id: string
  title: string
  type: EventType
  date: Date
  endDate?: Date
  location: string
  address?: string
  childId: string
  childName: string
  program?: string
  notes?: string
  opponent?: string
  /** true = projected from the enrollment's weekly recurrence, not a booked
   *  seat — renders a "Planned" chip and never a cancel affordance. */
  projected: boolean
}

const eventTypeConfig: Record<EventType, {
  icon: typeof Trophy
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  class: {
    icon: Calendar,
    label: "Class",
    color: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
  },
  game: {
    icon: Trophy,
    label: "Game",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  practice: {
    icon: Dumbbell,
    label: "Practice",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  tournament: {
    icon: Users,
    label: "Tournament",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
  },
}

function EventCard({
  event,
  compact = false,
  onOpenDetails
}: {
  event: ScheduleEvent
  compact?: boolean
  onOpenDetails: (event: ScheduleEvent) => void
}) {
  const config = eventTypeConfig[event.type]
  const Icon = config.icon

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  if (compact) {
    return (
      <button
        onClick={() => onOpenDetails(event)}
        className={cn(
          "w-full text-left p-2 rounded-lg border transition-all hover:scale-[1.02]",
          config.bgColor,
          config.borderColor
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("w-3 h-3 flex-shrink-0", config.color)} />
          <span className="text-xs font-medium text-ink truncate">{event.title}</span>
          {event.projected && (
            <span className="text-[9px] uppercase tracking-wide text-ink-faint flex-shrink-0">Planned</span>
          )}
        </div>
        <div className="text-[10px] text-ink-muted mt-0.5 truncate">
          {formatTime(event.date)} - {event.childName}
        </div>
      </button>
    )
  }

  return (
    <div
      onClick={() => onOpenDetails(event)}
      data-testid="schedule-event-card"
      data-projected={event.projected ? "true" : "false"}
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all cursor-pointer hover:scale-[1.01] hover:shadow-lg",
        config.borderColor,
        "bg-paper hover:bg-cream-2"
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            config.bgColor
          )}>
            <Icon className={cn("w-5 h-5", config.color)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge data-testid="event-type-badge" className={cn("text-[10px]", config.bgColor, config.color, "border-0")}>
                {config.label}
              </Badge>
              <Badge variant="outline" className="border-border text-ink-muted text-[10px]">
                {event.childName}
              </Badge>
              {event.projected && (
                <Badge
                  data-testid="planned-chip"
                  variant="outline"
                  className="border-dashed border-border text-ink-faint text-[10px]"
                >
                  Planned
                </Badge>
              )}
            </div>

            <h4 className="font-semibold text-ink text-sm mb-1">{event.title}</h4>

            {event.opponent && (
              <p className="text-xs text-ink-muted mb-2">vs {event.opponent}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(event.date)}
                {event.endDate && ` - ${formatTime(event.endDate)}`}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {event.location}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EventDetailModal({
  event,
  onClose
}: {
  event: ScheduleEvent
  onClose: () => void
}) {
  const config = eventTypeConfig[event.type]
  const Icon = config.icon

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  }

  const handleAddToCalendar = () => {
    const start = event.date.toISOString().replace(/-|:|\.\d\d\d/g, "")
    const end = (event.endDate || new Date(event.date.getTime() + 60 * 60 * 1000))
      .toISOString().replace(/-|:|\.\d\d\d/g, "")
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${start}/${end}&location=${encodeURIComponent(event.location)}&details=${encodeURIComponent(event.notes || "")}`
    window.open(url, "_blank")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        data-testid="event-detail-modal"
        className="relative w-full max-w-md rounded-3xl bg-cream border border-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className={cn("p-6 border-b border-border", config.bgColor)}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-cream-3 transition-colors"
          >
            <X className="w-5 h-5 text-ink-muted" />
          </button>

          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center",
              "bg-cream-3"
            )}>
              <Icon className={cn("w-7 h-7", config.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className={cn("text-[10px]", config.bgColor, config.color, "border-0")}>
                  {config.label}
                </Badge>
                {event.projected && (
                  <Badge variant="outline" className="border-dashed border-border text-ink-faint text-[10px]">
                    Planned
                  </Badge>
                )}
              </div>
              <h2 className="text-xl font-bold text-ink">{event.title}</h2>
              {event.opponent && (
                <p className="text-sm text-ink-muted">vs {event.opponent}</p>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-ink-muted mt-0.5" />
            <div>
              <p className="text-sm text-ink-muted">Player</p>
              <p className="text-ink font-medium">{event.childName}</p>
              {event.program && <p className="text-xs text-ink-muted">{event.program}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-ink-muted mt-0.5" />
            <div>
              <p className="text-sm text-ink-muted">Date & Time</p>
              <p className="text-ink font-medium">{formatDate(event.date)}</p>
              <p className="text-sm text-ink-muted">
                {formatTime(event.date)}
                {event.endDate && ` - ${formatTime(event.endDate)}`}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-ink-muted mt-0.5" />
            <div>
              <p className="text-sm text-ink-muted">Location</p>
              <p className="text-ink font-medium">{event.location}</p>
              {event.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  {event.address}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {event.notes && (
            <div className="p-3 rounded-xl bg-paper border border-border">
              <p className="text-xs text-ink-muted mb-1">Notes</p>
              <p className="text-sm text-ink-2">{event.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3">
          <Button
            onClick={handleAddToCalendar}
            className="flex-1"
          >
            <Download className="w-4 h-4 mr-2" />
            Add to Calendar
          </Button>
          {event.address && (
            <Button
              variant="outline"
              className="border-border text-ink-muted hover:text-ink"
              onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(event.address!)}`, "_blank")}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Directions
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MonthCalendar({
  events,
  currentDate,
  onOpenDetails
}: {
  events: ScheduleEvent[]
  currentDate: Date
  onOpenDetails: (event: ScheduleEvent) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const days: (number | null)[] = []

  // Add empty cells for days before the first day
  for (let i = 0; i < startDay; i++) {
    days.push(null)
  }

  // Add days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const getEventsForDay = (day: number) => {
    return events.filter(event => {
      const eventDate = new Date(event.date)
      return (
        eventDate.getFullYear() === year &&
        eventDate.getMonth() === month &&
        eventDate.getDate() === day
      )
    })
  }

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day

  return (
    <div className="rounded-2xl bg-paper border border-border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} className="p-3 text-center text-xs font-medium text-ink-muted">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = day ? getEventsForDay(day) : []
          return (
            <div
              key={index}
              className={cn(
                "min-h-[100px] p-2 border-b border-r border-border last:border-r-0",
                "[&:nth-child(7n)]:border-r-0",
                !day && "bg-cream"
              )}
            >
              {day && (
                <>
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-sm mb-1",
                    isToday(day)
                      ? "bg-primary-bright text-primary-foreground font-bold"
                      : "text-ink-muted"
                  )}>
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        compact
                        onOpenDetails={onOpenDetails}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-ink-muted text-center">
                        +{dayEvents.length - 3} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ListView({
  events,
  onOpenDetails
}: {
  events: ScheduleEvent[]
  onOpenDetails: (event: ScheduleEvent) => void
}) {
  const grouped = useMemo(() => {
    const groups: { date: Date; events: ScheduleEvent[] }[] = []
    let currentDate: string | null = null
    let currentGroup: ScheduleEvent[] = []

    events.forEach(event => {
      const dateStr = event.date.toDateString()
      if (dateStr !== currentDate) {
        if (currentDate !== null && currentGroup.length > 0) {
          groups.push({ date: new Date(currentDate), events: currentGroup })
        }
        currentDate = dateStr
        currentGroup = [event]
      } else {
        currentGroup.push(event)
      }
    })

    if (currentDate !== null && currentGroup.length > 0) {
      groups.push({ date: new Date(currentDate), events: currentGroup })
    }

    return groups
  }, [events])

  const formatDateHeader = (date: Date) => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow"
    }
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-paper border border-border">
        <Calendar className="w-12 h-12 text-ink-faint mx-auto mb-3" />
        <h3 className="text-ink font-medium mb-1">No events found</h3>
        <p className="text-sm text-ink-muted">
          Try adjusting your filters or date range
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {grouped.map((group, index) => (
        <div key={index}>
          <h3 className="font-semibold text-ink mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-ink-muted" />
            {formatDateHeader(group.date)}
            <span className="text-xs text-ink-faint font-normal">
              ({group.events.length} events)
            </span>
          </h3>
          <div className="space-y-3">
            {group.events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FullSchedule() {
  // FullSchedule is mounted `client:load` at the top of
  // src/pages/dashboard/schedule.astro, so it doubles as this page's
  // hydration beacon (repo convention — see children-overview.tsx's beacon
  // comment). E2E specs navigating to /dashboard/schedule rely on
  // waitForHydration(page) finding this.
  useHydrationBeacon()

  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [children, setChildren] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedChild, setSelectedChild] = useState<string | "all">("all")
  const [selectedType, setSelectedType] = useState<EventType | "all">("all")
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const res = await fetch("/api/dashboard/schedule")
        if (cancelled) return
        if (!res.ok) {
          setError(true)
          return
        }
        const data: { children: Array<{ id: string; name: string }>; events: FamilyScheduleEvent[] } =
          await res.json()
        if (cancelled) return
        setChildren(data.children ?? [])
        const mapped: ScheduleEvent[] = (data.events ?? []).map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          date: new Date(e.startsAt),
          endDate: e.endsAt ? new Date(e.endsAt) : undefined,
          location: e.location ?? "",
          address: e.address ?? undefined,
          childId: e.childId,
          childName: e.childName,
          projected: e.projected,
        }))
        setEvents(mapped)
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load schedule:", err)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (selectedChild !== "all" && event.childId !== selectedChild) return false
      if (selectedType !== "all" && event.type !== selectedType) return false

      // For month view, filter to current month
      if (viewMode === "month") {
        const eventMonth = event.date.getMonth()
        const eventYear = event.date.getFullYear()
        return eventMonth === currentDate.getMonth() && eventYear === currentDate.getFullYear()
      }

      // For list view, show upcoming events
      if (viewMode === "list") {
        return event.date >= new Date()
      }

      return true
    })
  }, [events, selectedChild, selectedType, viewMode, currentDate])

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === "prev") {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-3">
            <Calendar className="w-7 h-7 text-primary" />
            Schedule
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            All upcoming events for your family
          </p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="p-4 rounded-2xl bg-paper border border-border space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Month Navigation (for month view) */}
          {viewMode === "month" && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-2 rounded-xl hover:bg-cream-3 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-ink-muted" />
              </button>
              <h2 className="text-lg font-semibold text-ink min-w-[180px] text-center">
                {formatMonthYear(currentDate)}
              </h2>
              <button
                onClick={() => navigateMonth("next")}
                className="p-2 rounded-xl hover:bg-cream-3 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-ink-muted" />
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
                className="border-border text-ink-muted hover:text-ink ml-2"
              >
                Today
              </Button>
            </div>
          )}

          {viewMode === "list" && (
            <h2 className="text-lg font-semibold text-ink">
              Upcoming Events
            </h2>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-paper">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === "month"
                  ? "bg-cream-3 text-ink"
                  : "text-ink-muted hover:text-ink-2"
              )}
              title="Month view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === "list"
                  ? "bg-cream-3 text-ink"
                  : "text-ink-muted hover:text-ink-2"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-ink-muted" />

          {/* Child Filter */}
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="px-3 py-2 rounded-xl bg-paper border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Children</option>
            {children.map(child => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>

          {/* Event Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as EventType | "all")}
            className="px-3 py-2 rounded-xl bg-paper border border-border text-sm text-ink-2 focus:outline-none focus:border-primary/50"
          >
            <option value="all">All Event Types</option>
            {Object.entries(eventTypeConfig).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        {Object.entries(eventTypeConfig).map(([key, config]) => {
          const Icon = config.icon
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn("w-3 h-3 rounded", config.bgColor)} />
              <Icon className={cn("w-3 h-3", config.color)} />
              <span>{config.label}</span>
            </div>
          )
        })}
      </div>

      {/* Calendar/List View */}
      {loading ? (
        <LoadingSkeleton rows={5} variant="list" />
      ) : error ? (
        <div className="space-y-3">
          <ErrorBanner message="We couldn't load your schedule. Please try again." />
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      ) : viewMode === "month" ? (
        <MonthCalendar
          events={filteredEvents}
          currentDate={currentDate}
          onOpenDetails={setSelectedEvent}
        />
      ) : (
        <ListView
          events={filteredEvents}
          onOpenDetails={setSelectedEvent}
        />
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}
