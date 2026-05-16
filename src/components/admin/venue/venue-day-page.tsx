"use client"

import { useEffect, useMemo, useState } from "react"
import { useVenueDayData } from "@/lib/hooks/use-venue-day-data"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { formatStripDate, parseStripDate } from "@/lib/admin/week-strip"
import { DateNavigator } from "./date-navigator"
import { WeekStrip } from "./week-strip"
import { ActivityBlock } from "./activity-block"
import { FreeSpaceBlock } from "./free-space-block"
import type { ActivityType } from "@/lib/admin/venue-day-data"

type Props = {
  initialDate: string // YYYY-MM-DD
  locationId: string
  locationName: string
}

function actionLabelFor(type: ActivityType, isPast: boolean, isFuture: boolean): string {
  if (isPast) return "View attendance"
  if (isFuture) return "Scheduled"
  if (type === "league_game" || type === "tournament_game") return "Check in roster"
  if (type === "drop_in" || type === "class") return "Check in"
  return "View"
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

export function VenueDayPage({ initialDate, locationId, locationName }: Props) {
  useHydrationBeacon()
  const [date, setDate] = useState(initialDate)
  const { data, isLoading, lastUpdatedAt } = useVenueDayData({ date, locationId })

  // Sync URL with selected date so browser back/forward works.
  useEffect(() => {
    if (typeof window === "undefined") return
    const targetUrl = `/admin/venue/day/${date}`
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, "", targetUrl)
    }
  }, [date])

  const today = formatStripDate(new Date())
  const isPast = date < today
  const isFuture = date > today

  const niceDate = useMemo(() => {
    const d = parseStripDate(date)
    if (!d) return date
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
  }, [date])

  // For Phase 2 v1 the density map only shows the selected day's count.
  // A subsequent enhancement can prefetch the 7-day window.
  const densityByDate: Record<string, number> = data
    ? { [data.date]: data.blocks.length }
    : {}

  const lastUpdatedSeconds =
    lastUpdatedAt !== null ? Math.round((Date.now() - lastUpdatedAt) / 1000) : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">
            {locationName}
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">{niceDate}</h1>
          {data && (
            <p className="text-sm text-ink-muted">
              {data.blocks.length}{" "}
              {data.blocks.length === 1 ? "activity" : "activities"} scheduled
              {lastUpdatedSeconds !== null && (
                <> · updated {lastUpdatedSeconds}s ago</>
              )}
            </p>
          )}
        </div>
        <DateNavigator date={date} onChange={setDate} />
      </div>

      <WeekStrip anchorDate={date} densityByDate={densityByDate} onSelect={setDate} />

      {isLoading && (
        <div className="text-sm text-ink-muted">Loading…</div>
      )}

      {!isLoading && data && data.blocks.length === 0 && (
        <FreeSpaceBlock note="No activities scheduled" />
      )}

      {data && data.blocks.length > 0 && (
        <div className="bg-white rounded border border-border overflow-hidden">
          {data.blocks.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[60px_1fr] p-2.5 gap-2 border-b border-cream/60 last:border-b-0"
            >
              <div className="text-xs text-ink-muted font-medium pt-1">
                {formatTime(b.startAt)}
              </div>
              <ActivityBlock
                type={b.type}
                title={b.title}
                subtitle={b.subtitle}
                capacityCurrent={b.capacityCurrent}
                capacityMax={b.capacityMax}
                refWarning={b.refAssigned === false}
                primaryActionLabel={actionLabelFor(b.type, isPast, isFuture)}
                href={b.href ?? undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-xs text-ink-muted pt-2">
        <Legend swatch="emerald" icon="⚽" label="League" />
        <Legend swatch="emerald" icon="🏆" label="Tournament" />
        <Legend swatch="purple" icon="🎯" label="Drop-in" />
        <Legend swatch="blue" icon="🏫" label="Class" />
        <Legend swatch="blue" icon="🏕" label="Camp" />
        <Legend swatch="amber" icon="🔑" label="Rental" />
      </div>
    </div>
  )
}

function Legend({ swatch, icon, label }: { swatch: string; icon: string; label: string }) {
  const bg: Record<string, string> = {
    emerald: "bg-emerald-500",
    purple: "bg-purple-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bg[swatch] ?? "bg-gray-500"}`} />
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  )
}
