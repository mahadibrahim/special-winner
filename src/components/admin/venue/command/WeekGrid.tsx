"use client"

import { useMemo } from "react"
import { weekStrip, formatStripDate } from "@/lib/admin/week-strip"
import { ActivityBlock } from "./ActivityBlock"
import type { VenueTodayPayload, VenueTodaySession } from "@/lib/venue/today-types"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type Props = {
  payload: VenueTodayPayload
  onPrev: () => void
  onNext: () => void
  onOpenActivity: (sessionId: string) => void
}

/**
 * Week view for ScheduleCalendar.
 *
 * Since payload is day-scoped (one day's sessions), we render all 7 day
 * columns but only populate the column matching payload.date with real
 * activity blocks. The other six are shown as empty placeholders so the
 * operator can see the week structure and navigate to other days.
 */
export function WeekGrid({ payload, onPrev, onNext, onOpenActivity }: Props) {
  const anchor = useMemo(() => {
    const d = new Date(`${payload.date}T00:00:00.000Z`)
    return isNaN(d.getTime()) ? new Date() : d
  }, [payload.date])

  const days = useMemo(() => weekStrip(anchor), [anchor])
  const todayStr = formatStripDate(new Date())

  // Group sessions by space for display
  const sessionsBySpace = useMemo(() => {
    const map = new Map<string, VenueTodaySession[]>()
    for (const s of payload.sessions) {
      const list = map.get(s.spaceId) ?? []
      list.push(s)
      map.set(s.spaceId, list)
    }
    return map
  }, [payload.sessions])

  const spaces = payload.spaces

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#e4ddcf]">
        <button
          onClick={onPrev}
          aria-label="Previous week"
          className="px-2.5 py-1.5 border border-[#e4ddcf] bg-[#fffdf8] rounded text-sm text-ink-muted hover:bg-cream min-h-[36px] min-w-[36px]"
        >
          ←
        </button>
        <button
          onClick={onNext}
          aria-label="Next week"
          className="px-2.5 py-1.5 border border-[#e4ddcf] bg-[#fffdf8] rounded text-sm text-ink-muted hover:bg-cream min-h-[36px] min-w-[36px]"
        >
          →
        </button>
        <span className="text-sm text-ink-muted">
          {days[0] && days[6]
            ? `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
            : ""}
        </span>
      </div>

      {/* 7-day grid */}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[560px]"
          style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}
        >
          {/* Day header row */}
          {days.map((d, idx) => {
            const key = formatStripDate(d)
            const isActive = key === payload.date
            const isToday = key === todayStr
            return (
              <div
                key={key}
                className={`px-2 py-2 border-b border-r border-[#e4ddcf] text-center ${
                  isActive ? "bg-ink text-cream" : "bg-[#fffdf8]"
                }`}
              >
                <div
                  className={`text-[10px] uppercase tracking-wider font-bold ${
                    isActive ? "text-cream/70" : "text-ink-muted"
                  }`}
                >
                  {DAY_LABELS[idx]}
                </div>
                <div
                  className={`text-sm font-semibold mt-0.5 ${
                    isToday && !isActive
                      ? "text-emerald-600"
                      : isActive
                        ? "text-cream"
                        : "text-ink"
                  }`}
                >
                  {d.getUTCDate()}
                </div>
              </div>
            )
          })}

          {/* Day columns with condensed blocks */}
          {days.map((d) => {
            const key = formatStripDate(d)
            const isActive = key === payload.date
            const sessionsForDay: VenueTodaySession[] = isActive
              ? payload.sessions
              : []

            return (
              <div
                key={key}
                className={`border-r border-[#e4ddcf] min-h-[120px] p-1.5 space-y-1 ${
                  isActive ? "bg-cream/30" : "bg-[#fffdf8]"
                }`}
              >
                {sessionsForDay.length === 0 ? (
                  <div className="text-[10px] text-ink-muted/50 text-center pt-3">—</div>
                ) : (
                  sessionsForDay.map((s) => (
                    <div key={s.id} className="h-6">
                      <ActivityBlock
                        session={s}
                        onClick={onOpenActivity}
                        compact={true}
                      />
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Space legend at bottom */}
      {spaces.length > 0 && (
        <div className="px-4 py-2 border-t border-[#e4ddcf] flex flex-wrap gap-x-4 gap-y-1">
          {spaces.map((sp) => {
            const count = sessionsBySpace.get(sp.id)?.length ?? 0
            return (
              <span key={sp.id} className="text-xs text-ink-muted">
                <strong className="text-ink">{sp.name}</strong>
                {count > 0 && ` · ${count}`}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
