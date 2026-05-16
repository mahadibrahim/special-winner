"use client"

import { parseStripDate, formatStripDate } from "@/lib/admin/week-strip"

type Props = {
  date: string // YYYY-MM-DD
  onChange: (newDate: string) => void
}

/**
 * Top-right controls on the Venue Day header: Today button, prev/next
 * day arrows, and a native date picker for far jumps. All controls hit
 * the 44px touch-target minimum (per the tablet UX target in §5).
 */
export function DateNavigator({ date, onChange }: Props) {
  const today = formatStripDate(new Date())

  function nudge(deltaDays: number) {
    const d = parseStripDate(date)
    if (!d) return
    d.setUTCDate(d.getUTCDate() + deltaDays)
    onChange(formatStripDate(d))
  }

  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <button
        onClick={() => onChange(today)}
        className="px-3 py-2 border border-border bg-white rounded text-sm text-ink min-h-[44px]"
        disabled={date === today}
      >
        Today
      </button>
      <button
        onClick={() => nudge(-1)}
        aria-label="Previous day"
        className="px-3 py-2 border border-border bg-white rounded text-sm text-ink min-h-[44px] min-w-[44px]"
      >
        ←
      </button>
      <button
        onClick={() => nudge(1)}
        aria-label="Next day"
        className="px-3 py-2 border border-border bg-white rounded text-sm text-ink min-h-[44px] min-w-[44px]"
      >
        →
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 border border-border bg-white rounded text-sm text-ink min-h-[44px]"
      />
    </div>
  )
}
