"use client"

import { weekStrip, formatStripDate } from "@/lib/admin/week-strip"

type Props = {
  anchorDate: string // YYYY-MM-DD — currently selected
  densityByDate: Record<string, number>
  onSelect: (newDate: string) => void
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * The 7-day strip below the Venue Day header. Each cell shows day-of-week,
 * date, and an activity-density dot string so the operator can scan
 * forward/back at a glance. Density caps at 6 dots to keep the cells from
 * stretching on busy days.
 */
export function WeekStrip({ anchorDate, densityByDate, onSelect }: Props) {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`)
  const days = weekStrip(anchor)

  return (
    <div className="grid grid-cols-7 gap-1 bg-white p-1.5 rounded border border-border">
      {days.map((d, idx) => {
        const key = formatStripDate(d)
        const isActive = key === anchorDate
        const density = densityByDate[key] ?? 0
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-pressed={isActive}
            className={`p-1.5 text-center rounded transition-colors min-h-[44px] ${
              isActive ? "bg-ink text-cream" : "hover:bg-cream/60 text-ink"
            }`}
          >
            <div
              className={`text-[10px] uppercase tracking-wider ${
                isActive ? "text-cream/70" : "text-ink-muted"
              }`}
            >
              {DAY_LABELS[idx]}
            </div>
            <div className="text-sm font-semibold mt-0.5">{d.getUTCDate()}</div>
            <div
              className={`text-[10px] mt-0.5 ${
                isActive ? "text-cream/80" : "text-ink-muted/60"
              }`}
            >
              {density > 0 ? "●".repeat(Math.min(density, 6)) : "—"}
            </div>
          </button>
        )
      })}
    </div>
  )
}
