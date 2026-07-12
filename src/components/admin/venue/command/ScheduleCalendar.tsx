"use client"

import { useMemo, useState } from "react"
import { blockRows, clampRowsToWindow, columnsForSpaces } from "@/lib/venue/calendar-layout"
import { formatStripDate, parseStripDate } from "@/lib/admin/week-strip"
import { ActivityBlock } from "./ActivityBlock"
import { WeekGrid } from "./WeekGrid"
import type { VenueTodayPayload, VenueTodaySession } from "@/lib/venue/today-types"

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_START_HOUR = 8   // 8 AM
const DAY_END_HOUR   = 21  // 9 PM  → 13 hours → 26 half-hour rows
const TOTAL_ROWS     = (DAY_END_HOUR - DAY_START_HOUR) * 2  // 26
const ROW_HEIGHT_PX  = 26  // matches mockup grid-template-rows: repeat(26, 26px)
const GUTTER_WIDTH   = 62  // px, time-label column

// Hour labels shown in the gutter. Each hour occupies 2 rows (2×30 min).
// First label is at row 1 (8 AM), then every 2 rows.
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => ({
  hour: DAY_START_HOUR + i,
  row:  i * 2 + 1,           // grid-row (1-based)
}))

function fmtHour(hour: number): string {
  if (hour === 12) return "12 PM"
  if (hour < 12)  return `${hour} AM`
  return `${hour - 12} PM`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "day" | "week"

type Props = {
  payload: VenueTodayPayload
  view: View
  onView: (v: View) => void
  onPrev: () => void
  onNext: () => void
  onToday?: () => void
  onOpenActivity: (sessionId: string) => void
}

// ─── Day grid helpers ─────────────────────────────────────────────────────────

/**
 * For each space column, find gaps between sessions (and before/after) that
 * represent unbooked time within the 8 AM–9 PM window. We expose them as
 * "open slot" cells so operators can see availability at a glance.
 */
function openSlots(
  sessions: VenueTodaySession[],
  spaceId: string,
  timeZone: string,
): Array<{ rowStart: number; rowEnd: number }> {
  const spaceSessions = sessions
    .filter((s) => s.spaceId === spaceId)
    .map((s) => blockRows(s.startsAt, s.endsAt, DAY_START_HOUR, timeZone))
    .sort((a, b) => a.rowStart - b.rowStart)

  const slots: Array<{ rowStart: number; rowEnd: number }> = []
  let cursor = 1 // start of window (row 1 = 8 AM)

  for (const { rowStart, rowEnd } of spaceSessions) {
    if (rowStart > cursor) slots.push({ rowStart: cursor, rowEnd: rowStart })
    cursor = Math.max(cursor, rowEnd)
  }
  if (cursor <= TOTAL_ROWS) slots.push({ rowStart: cursor, rowEnd: TOTAL_ROWS + 1 })

  return slots.filter((s) => s.rowEnd > s.rowStart)
}

// ─── Derived date label ────────────────────────────────────────────────────────

function niceDate(dateStr: string): string {
  const d = parseStripDate(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    timeZone: "UTC",
  })
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ScheduleCalendar({
  payload,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  onOpenActivity,
}: Props) {
  const timeZone     = payload.timezone

  // Hide-empty-fields toggle: default ON (hidden) — a command-center screen
  // with a dozen-plus field columns and nothing scheduled on most of them
  // is the norm-breaker the audit flagged, and an empty column offers no
  // click affordance anyway. Toggle reveals them for hold-planning.
  const [hideEmpty, setHideEmpty] = useState(true)

  const activeSpaceIds = useMemo(
    () => new Set(payload.sessions.map((s) => s.spaceId)),
    [payload.sessions],
  )

  const visibleSpaces = useMemo(() => {
    if (!hideEmpty) return payload.spaces
    const filtered = payload.spaces.filter((sp) => activeSpaceIds.has(sp.id))
    // Guard: an all-empty day would filter every column away and render a
    // broken/columnless grid — fall back to showing all spaces.
    return filtered.length > 0 ? filtered : payload.spaces
  }, [hideEmpty, payload.spaces, activeSpaceIds])

  const hiddenSpaceCount = payload.spaces.length - visibleSpaces.length

  const spaces       = visibleSpaces
  const spaceColumns = useMemo(() => columnsForSpaces(spaces), [spaces])
  const numSpaces    = spaces.length

  // Day-view: compute open slots per space column
  const openSlotsBySpace = useMemo(() => {
    const map = new Map<string, Array<{ rowStart: number; rowEnd: number }>>()
    for (const sp of spaces) {
      map.set(sp.id, openSlots(payload.sessions, sp.id, timeZone))
    }
    return map
  }, [payload.sessions, spaces, timeZone])

  // The grid template: gutter col + one col per space, with a legible
  // floor width so headers don't overlap when a location has many fields.
  const gridTemplate = `${GUTTER_WIDTH}px repeat(${numSpaces}, minmax(110px, 1fr))`

  const today = formatStripDate(new Date())
  const isToday = payload.date === today

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#e4ddcf] flex-wrap">
        {/* Date label + nav */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onPrev()}
            aria-label="Previous day"
            className="px-2.5 py-1.5 border border-[#e4ddcf] bg-[#fffdf8] rounded text-sm text-ink-muted hover:bg-cream min-h-[36px] min-w-[36px] font-semibold"
          >
            ‹
          </button>
          <button
            onClick={() => onToday?.()}
            aria-label="Today"
            className={`px-3 py-1.5 border rounded text-sm font-semibold min-h-[36px] ${
              isToday
                ? "bg-ink text-cream border-ink"
                : "border-[#e4ddcf] bg-[#fffdf8] text-ink hover:bg-cream"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => onNext()}
            aria-label="Next day"
            className="px-2.5 py-1.5 border border-[#e4ddcf] bg-[#fffdf8] rounded text-sm text-ink-muted hover:bg-cream min-h-[36px] min-w-[36px] font-semibold"
          >
            ›
          </button>
          <span className="text-sm font-semibold text-ink ml-1">
            {niceDate(payload.date)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Empty-fields toggle (day view only — week view condenses spaces into a legend) */}
          {view === "day" && (
            <button
              onClick={() => setHideEmpty((v) => !v)}
              className="px-3 py-1.5 border border-[#e4ddcf] bg-[#fffdf8] rounded-lg text-xs font-semibold text-ink-muted hover:text-ink hover:bg-cream min-h-[36px]"
              aria-pressed={hideEmpty}
              title={
                hideEmpty
                  ? `${hiddenSpaceCount} field${hiddenSpaceCount === 1 ? "" : "s"} with nothing scheduled today are hidden`
                  : "Showing every field, including empty ones"
              }
            >
              Empty fields: {hideEmpty ? "hidden" : "shown"}
            </button>
          )}

          {/* Day / Week toggle */}
          <div className="flex bg-[#fffdf8] border border-[#e4ddcf] rounded-xl p-[3px]">
            <button
              onClick={() => onView("day")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                view === "day"
                  ? "bg-ink text-cream"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => onView("week")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                view === "week"
                  ? "bg-ink text-cream"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* ── Week view ──────────────────────────────────────────────────────── */}
      {view === "week" && (
        <WeekGrid
          payload={payload}
          onPrev={onPrev}
          onNext={onNext}
          onOpenActivity={onOpenActivity}
          timezone={timeZone}
        />
      )}

      {/* ── Day view ───────────────────────────────────────────────────────── */}
      {view === "day" && (
        <div className="overflow-x-auto">
          {/* Sticky column headers */}
          {numSpaces > 0 && (
            <div
              className="sticky top-0 z-10 grid bg-[#fffdf8] border-b border-[#e4ddcf]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* Empty gutter header */}
              <div />
              {spaces.map((sp) => (
                <div
                  key={sp.id}
                  title={sp.name}
                  className="px-3 py-2.5 text-center font-bold text-[13px] text-ink border-l border-[#efe9dc] truncate"
                >
                  {sp.name}
                </div>
              ))}
            </div>
          )}

          {/* Main grid body */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: gridTemplate,
              gridTemplateRows:    `repeat(${TOTAL_ROWS}, ${ROW_HEIGHT_PX}px)`,
              minWidth:            `${GUTTER_WIDTH + numSpaces * 110}px`,
            }}
          >
            {/* ── Horizontal hour lines (full-width, behind everything) ── */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
            >
              {HOURS.map(({ hour, row }) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-[#efe9dc]"
                  style={{
                    top: `${(row - 1) * ROW_HEIGHT_PX}px`,
                  }}
                />
              ))}
            </div>

            {/* ── Vertical lane separators ── */}
            <div
              className="absolute pointer-events-none"
              aria-hidden
              style={{
                left:   `${GUTTER_WIDTH}px`,
                right:  0,
                top:    0,
                bottom: 0,
                display: "grid",
                gridTemplateColumns: `repeat(${numSpaces}, minmax(0, 1fr))`,
              }}
            >
              {spaces.map((sp) => (
                <div key={sp.id} className="border-l border-[#efe9dc]" />
              ))}
            </div>

            {/* ── Time gutter ── */}
            <div style={{ gridColumn: 1 }} aria-hidden>
              {HOURS.map(({ hour, row }) => (
                <div
                  key={hour}
                  className="text-[11px] text-ink-muted text-right pr-2 leading-none"
                  style={{
                    gridRow:       row,
                    // Position label slightly above the hour line (matches mockup's translateY(-7px))
                    position:      "absolute",
                    top:           `${(row - 1) * ROW_HEIGHT_PX - 7}px`,
                    left:          0,
                    width:         `${GUTTER_WIDTH - 4}px`,
                    paddingRight:  "8px",
                    textAlign:     "right",
                  }}
                >
                  {fmtHour(hour)}
                </div>
              ))}
            </div>

            {/* ── Activity blocks per space ── */}
            {spaceColumns.map((col) => {
              const spaceSessions = payload.sessions.filter(
                (s) => s.spaceId === col.id
              )
              const slots = openSlotsBySpace.get(col.id) ?? []

              return (
                <div
                  key={col.id}
                  className="relative"
                  style={{ gridColumn: col.index, gridRow: `1 / ${TOTAL_ROWS + 1}` }}
                >
                  {/* Open slot placeholders */}
                  {slots.map((slot) => (
                    <div
                      key={`${col.id}-open-${slot.rowStart}`}
                      className="absolute inset-x-1 border border-dashed border-[#e4ddcf] rounded-lg flex items-center justify-center text-xs text-ink-muted/70 hover:border-ink-muted hover:text-ink-muted hover:bg-[#fbf7ee] cursor-pointer transition-colors"
                      style={{
                        top:    `${(slot.rowStart - 1) * ROW_HEIGHT_PX + 2}px`,
                        height: `${(slot.rowEnd - slot.rowStart) * ROW_HEIGHT_PX - 4}px`,
                      }}
                    >
                      <span className="text-[15px] mr-1">+</span>
                      Open
                    </div>
                  ))}

                  {/* Activity blocks */}
                  {spaceSessions.map((session) => {
                    // Clamp to the rendered grid window — a session outside
                    // business hours (e.g. a pickup game started just after
                    // midnight) would otherwise get a negative/overflowing
                    // `top` offset and visually escape the calendar
                    // container, overlapping page chrome above it and
                    // eating clicks meant for the block. See
                    // clampRowsToWindow's doc comment for the full story.
                    const rawRows = blockRows(
                      session.startsAt,
                      session.endsAt,
                      DAY_START_HOUR,
                      timeZone,
                    )
                    const { rowStart, rowEnd, clamped } = clampRowsToWindow(
                      rawRows.rowStart,
                      rawRows.rowEnd,
                      TOTAL_ROWS,
                    )
                    return (
                      <div
                        key={session.id}
                        className="absolute inset-x-1"
                        style={{
                          top:    `${(rowStart - 1) * ROW_HEIGHT_PX + 2}px`,
                          height: `${(rowEnd - rowStart) * ROW_HEIGHT_PX - 4}px`,
                        }}
                      >
                        <ActivityBlock
                          session={session}
                          onClick={onOpenActivity}
                          compact={(rowEnd - rowStart) <= 2}
                          timezone={timeZone}
                          clamped={clamped}
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Activity-kind legend ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-[#e4ddcf] text-xs text-ink-muted">
        <LegendDot color="bg-emerald-600" icon="⚽" label="League"     />
        <LegendDot color="bg-purple-600"  icon="🏆" label="Tournament" />
        <LegendDot color="bg-teal-600"    icon="🎯" label="Drop-in"    />
        <LegendDot color="bg-blue-600"    icon="🏫" label="Class"      />
        <LegendDot color="bg-orange-600"  icon="🏕" label="Camp"       />
        <LegendDot color="bg-slate-500"   icon="🔑" label="Rental"     />
        <LegendDot color="bg-stone-400"   icon="🔧" label="Hold"       />
        <span className="inline-flex items-center gap-1 text-ink-muted/70">
          ▢ dashed = open slot
        </span>
      </div>
    </div>
  )
}

// ─── Legend dot ────────────────────────────────────────────────────────────────

function LegendDot({
  color,
  icon,
  label,
}: {
  color: string
  icon: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  )
}
