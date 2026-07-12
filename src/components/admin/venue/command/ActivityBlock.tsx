"use client"

import { useState } from "react"
import type { VenueTodaySession } from "@/lib/venue/today-types"

// ─── Kind → style mapping ─────────────────────────────────────────────────────
// Mirrors the color conventions in activity-block.tsx (the existing day-page
// component) and the mockup's CSS variables, adapted to VenueTodaySession.kind.

type StyleSet = {
  bg: string
  border: string
  text: string   // text on coloured bg (solid blocks in the grid)
  icon: string
  label: string
}

const KIND_STYLES: Record<VenueTodaySession["kind"], StyleSet> = {
  league:     { bg: "bg-emerald-600", border: "border-emerald-700", text: "text-white", icon: "⚽", label: "League"      },
  tournament: { bg: "bg-purple-600",  border: "border-purple-700",  text: "text-white", icon: "🏆", label: "Tournament"  },
  dropin:     { bg: "bg-teal-600",    border: "border-teal-700",    text: "text-white", icon: "🎯", label: "Drop-in"     },
  class:      { bg: "bg-blue-600",    border: "border-blue-700",    text: "text-white", icon: "🏫", label: "Class"       },
  camp:       { bg: "bg-orange-600",  border: "border-orange-700",  text: "text-white", icon: "🏕", label: "Camp"        },
  rental:     { bg: "bg-slate-500",   border: "border-slate-600",   text: "text-white", icon: "🔑", label: "Rental"      },
  hold:       { bg: "bg-stone-400",   border: "border-stone-500",   text: "text-white", icon: "🔧", label: "Hold"        },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  session: VenueTodaySession
  onClick: (sessionId: string) => void
  /** Compact mode: used by WeekGrid for condensed blocks. */
  compact?: boolean
  timezone?: string
  /**
   * True when the block's true time window fell (fully or partly) outside
   * the rendered grid window and had to be clamped to stay on-screen — see
   * `clampRowsToWindow`'s doc comment. Renders an "off-hours" chip so a
   * clamped block (visually sitting right at the grid's open/close edge)
   * isn't mistaken for a normal on-the-hour session.
   */
  clamped?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityBlock({ session, onClick, compact = false, timezone = "America/New_York", clamped = false }: Props) {
  const [showPop, setShowPop] = useState(false)
  const style = KIND_STYLES[session.kind]
  const refWarn = session.refAssigned === false

  const timeRange = `${formatTime(session.startsAt, timezone)}–${formatTime(session.endsAt, timezone)}`
  const capStr =
    session.capacity !== null
      ? `${session.booked}/${session.capacity}`
      : session.booked > 0
        ? `${session.booked} booked`
        : null

  return (
    <div
      data-activity-block
      role="button"
      tabIndex={0}
      onClick={() => onClick(session.id)}
      onKeyDown={(e) => e.key === "Enter" && onClick(session.id)}
      onMouseEnter={() => setShowPop(true)}
      onMouseLeave={() => setShowPop(false)}
      onFocus={() => setShowPop(true)}
      onBlur={() => setShowPop(false)}
      className={`relative h-full w-full rounded-lg overflow-hidden cursor-pointer select-none shadow-sm ${style.bg} ${style.text} transition-opacity hover:opacity-90`}
      style={{ padding: compact ? "2px 5px" : "5px 8px" }}
    >
      {/* Ref warning badge */}
      {refWarn && (
        <span className="absolute top-1 right-1.5 bg-yellow-300 text-yellow-900 text-[10px] font-black rounded px-1 leading-tight z-10">
          ⚠ NO REF
        </span>
      )}

      {compact ? (
        /* Compact / week-view rendering */
        <div className="flex items-center gap-1 min-w-0">
          {clamped && (
            <span className="shrink-0 text-[9.5px] font-bold bg-stone-800/80 text-white rounded px-1 leading-tight">
              off-hours
            </span>
          )}
          <div className="text-[10px] font-bold leading-tight truncate">
            {style.icon} {session.title}
          </div>
        </div>
      ) : (
        /* Full / day-view rendering */
        <>
          <div className="font-bold text-[12.5px] leading-tight flex items-center gap-1">
            <span>{style.icon}</span>
            <span className="truncate">{session.title}</span>
          </div>
          {clamped && (
            <span className="inline-block text-[9.5px] font-bold bg-stone-800/80 text-white rounded px-1 mt-0.5 leading-tight">
              off-hours · {formatTime(session.startsAt, timezone)}
            </span>
          )}
          <div className="text-[11px] opacity-90 mt-0.5 leading-tight truncate">
            {[timeRange, capStr, session.checkedIn > 0 ? `${session.checkedIn} here` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </>
      )}

      {/* Hover detail popover */}
      {showPop && !compact && (
        <div
          className="absolute left-1/2 top-2 -translate-x-1/2 z-50 w-60 bg-[#fffdf8] text-[#1c1a17] border border-[#e4ddcf] rounded-xl shadow-xl p-3.5 pointer-events-none"
          role="tooltip"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#8a8175]">
              {style.label}
            </span>
          </div>
          <h4 className="text-sm font-bold m-0 mb-0.5">{session.title}</h4>
          <p className="text-xs text-[#8a8175] mb-2.5">
            {timeRange} · {session.spaceName}
          </p>

          {session.capacity !== null && (
            <div className="flex justify-between text-[12.5px] py-1 border-t border-[#efe9dc]">
              <span>Booked</span>
              <strong>{session.booked} / {session.capacity}</strong>
            </div>
          )}
          <div className="flex justify-between text-[12.5px] py-1 border-t border-[#efe9dc]">
            <span>Checked in</span>
            <strong>{session.checkedIn}</strong>
          </div>
          {session.waiversOut > 0 && (
            <div className="flex justify-between text-[12.5px] py-1 border-t border-[#efe9dc]">
              <span>Waivers</span>
              <span className="font-bold text-amber-700">{session.waiversOut} outstanding</span>
            </div>
          )}
          {refWarn && (
            <div className="flex justify-between text-[12.5px] py-1 border-t border-[#efe9dc]">
              <span>Referee</span>
              <span className="font-bold text-red-600">Unassigned</span>
            </div>
          )}

          <div className="flex gap-1.5 mt-2.5">
            <button
              className="flex-1 border border-[#1c1a17] bg-[#1c1a17] text-[#fffdf8] rounded-lg py-1.5 text-xs font-bold pointer-events-auto"
              onPointerDown={(e) => { e.stopPropagation(); onClick(session.id) }}
            >
              Open ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
