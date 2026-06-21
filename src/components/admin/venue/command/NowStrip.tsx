"use client"

import { useMemo } from "react"
import { deriveNowNext } from "@/lib/venue/derive-now-next"
import type { VenueTodaySession } from "@/lib/venue/today-types"

// ─── Kind → accent colour (left border on the card) ──────────────────────────
// Mirrors the command-center-layout.html mockup's --kind colour variables.

const KIND_BORDER: Record<VenueTodaySession["kind"], string> = {
  league:     "border-l-emerald-600",
  tournament: "border-l-purple-600",
  dropin:     "border-l-teal-600",
  class:      "border-l-blue-600",
  camp:       "border-l-orange-600",
  rental:     "border-l-slate-500",
  hold:       "border-l-stone-400",
}

const KIND_BAR: Record<VenueTodaySession["kind"], string> = {
  league:     "bg-emerald-600",
  tournament: "bg-purple-600",
  dropin:     "bg-teal-600",
  class:      "bg-blue-600",
  camp:       "bg-orange-600",
  rental:     "bg-slate-500",
  hold:       "bg-stone-400",
}

const KIND_ICON: Record<VenueTodaySession["kind"], string> = {
  league:     "⚽",
  tournament: "🏆",
  dropin:     "🎯",
  class:      "🏫",
  camp:       "🏕",
  rental:     "🔑",
  hold:       "🔧",
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

function fillPct(session: VenueTodaySession): number {
  if (!session.capacity || session.capacity === 0) return 0
  return Math.round((session.booked / session.capacity) * 100)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  sessions: VenueTodaySession[]
  timezone: string
  onOpenActivity: (sessionId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NowStrip({ sessions, timezone, onOpenActivity }: Props) {
  const { now, next } = useMemo(
    () => deriveNowNext(sessions, Date.now()),
    [sessions]
  )

  if (now.length === 0 && next.length === 0) {
    return (
      <div className="text-sm text-ink-muted py-2">
        No sessions scheduled for the rest of today.
      </div>
    )
  }

  return (
    <div
      className="flex gap-2.5 overflow-x-auto pb-0.5"
      aria-label="Now and next sessions"
    >
      {now.map((s) => (
        <NowCard
          key={s.id}
          session={s}
          isNow={true}
          timezone={timezone}
          onOpen={onOpenActivity}
        />
      ))}
      {next.map((s) => (
        <NowCard
          key={s.id}
          session={s}
          isNow={false}
          timezone={timezone}
          onOpen={onOpenActivity}
        />
      ))}
    </div>
  )
}

// ─── Individual card ──────────────────────────────────────────────────────────

type CardProps = {
  session: VenueTodaySession
  isNow: boolean
  timezone: string
  onOpen: (id: string) => void
}

function NowCard({ session, isNow, timezone, onOpen }: CardProps) {
  const borderClass = KIND_BORDER[session.kind]
  const barClass = KIND_BAR[session.kind]
  const icon = KIND_ICON[session.kind]
  const fill = fillPct(session)
  const refWarn = session.refAssigned === false

  return (
    <button
      onClick={() => onOpen(session.id)}
      className={`
        flex-none min-w-[185px] bg-[#fffdf8] border border-[#e4ddcf] border-l-4 ${borderClass}
        rounded-xl p-3 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ink/20
        ${!isNow ? "opacity-95" : ""}
      `}
    >
      {/* Label row */}
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-ink-muted leading-tight mb-1">
        {isNow
          ? `Now · ${session.spaceName}`
          : `Next · ${formatTime(session.startsAt, timezone)} · ${session.spaceName}`}
      </div>

      {/* Title */}
      <div className="font-bold text-ink flex items-center gap-1.5 mb-1.5 leading-tight">
        <span>{icon}</span>
        <span className="truncate">{session.title}</span>
      </div>

      {/* Meta line */}
      {refWarn ? (
        <div className="text-xs font-bold text-amber-700">
          ⚠ No ref assigned
        </div>
      ) : (
        <div className="text-xs text-ink-muted">
          {isNow
            ? [
                session.checkedIn > 0 ? `${session.checkedIn} checked in` : null,
                session.booked > 0 ? `${session.booked} booked` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"
            : session.capacity !== null
              ? `${session.booked} / ${session.capacity} registered`
              : session.booked > 0
                ? `${session.booked} registered`
                : "—"}
        </div>
      )}

      {/* Capacity bar (now-cards with capacity) */}
      {isNow && session.capacity !== null && fill > 0 && (
        <div className="h-1.5 rounded-full bg-[#efe9dc] mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${barClass}`}
            style={{ width: `${fill}%` }}
          />
        </div>
      )}
    </button>
  )
}
