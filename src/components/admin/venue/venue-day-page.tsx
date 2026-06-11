"use client"

import { useEffect, useMemo, useState } from "react"
import { useVenueDayData } from "@/lib/hooks/use-venue-day-data"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { formatStripDate, parseStripDate } from "@/lib/admin/week-strip"
import { DateNavigator } from "./date-navigator"
import { WeekStrip } from "./week-strip"
import { ActivityBlock } from "./activity-block"
import { FreeSpaceBlock } from "./free-space-block"
import { AddHoldForm } from "./add-hold-form"
import { toast } from "sonner"
import type { ActivityType, ActivityBlock as ActivityBlockData } from "@/lib/admin/venue-day-data"

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
  const { data, isLoading, lastUpdatedAt, refetch } = useVenueDayData({ date, locationId })
  const [showHoldForm, setShowHoldForm] = useState(false)

  const deleteHold = async (blockId: string) => {
    const res = await fetch(`/api/admin/venue-day/holds/${blockId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success("Hold removed")
      refetch()
    } else {
      const json = await res.json().catch(() => ({}))
      toast.error(typeof json.error === "string" ? json.error : "Could not remove hold")
    }
  }

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

  // Group blocks by field (ledger resource). Resource order comes from
  // the server (venue, then sortOrder); unattributed blocks sink to the
  // end under "Unassigned".
  const groups = useMemo(() => {
    if (!data) return []
    const byName = new Map<string, ActivityBlockData[]>()
    for (const b of data.blocks) {
      const key = b.resourceName ?? "Unassigned"
      const list = byName.get(key) ?? []
      list.push(b)
      byName.set(key, list)
    }
    const ordered: Array<{ name: string; venueName: string | null; blocks: ActivityBlockData[] }> = []
    for (const r of data.resources) {
      ordered.push({ name: r.name, venueName: r.venueName, blocks: byName.get(r.name) ?? [] })
      byName.delete(r.name)
    }
    for (const [name, blocks] of byName) {
      ordered.push({ name, venueName: null, blocks })
    }
    return ordered
  }, [data])

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
        <div className="flex items-start gap-2">
          <button
            onClick={() => setShowHoldForm((v) => !v)}
            className="px-3 py-2 bg-ink text-cream rounded text-sm font-medium min-h-[44px]"
          >
            {showHoldForm ? "Close" : "+ Add hold"}
          </button>
          <DateNavigator date={date} onChange={setDate} />
        </div>
      </div>

      {showHoldForm && data && (
        <AddHoldForm
          date={date}
          resources={data.resources}
          onSaved={() => {
            setShowHoldForm(false)
            refetch()
          }}
          onCancel={() => setShowHoldForm(false)}
        />
      )}

      <WeekStrip anchorDate={date} densityByDate={densityByDate} onSelect={setDate} />

      {isLoading && (
        <div className="text-sm text-ink-muted">Loading…</div>
      )}

      {!isLoading && data && data.blocks.length === 0 && (
        <FreeSpaceBlock note="No activities scheduled" />
      )}

      {data && data.blocks.length > 0 && (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={`${g.venueName ?? ""}-${g.name}`} className="bg-white rounded border border-border overflow-hidden">
              <div className="flex items-baseline gap-2 px-3 py-2 bg-cream/50 border-b border-border">
                <span className="text-sm font-semibold text-ink">{g.name}</span>
                {g.venueName && (
                  <span className="text-[10px] uppercase tracking-widest text-ink-muted">
                    {g.venueName}
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-muted">
                  {g.blocks.length === 0
                    ? "Free all day"
                    : `${g.blocks.length} ${g.blocks.length === 1 ? "booking" : "bookings"}`}
                </span>
              </div>
              {g.blocks.map((b) => (
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
                    primaryActionLabel={
                      b.blockId ? undefined : actionLabelFor(b.type, isPast, isFuture)
                    }
                    href={b.blockId ? undefined : (b.href ?? undefined)}
                    onDelete={b.blockId ? () => void deleteHold(b.blockId!) : undefined}
                  />
                </div>
              ))}
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
        <Legend swatch="slate" icon="🤝" label="External" />
        <Legend swatch="stone" icon="🔧" label="Maintenance" />
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
    slate: "bg-slate-500",
    stone: "bg-stone-500",
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bg[swatch] ?? "bg-gray-500"}`} />
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  )
}
