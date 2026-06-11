"use client"

import type { ActivityType } from "@/lib/admin/venue-day-data"

type StyleSet = { bg: string; border: string; icon: string; label: string }

const STYLES: Record<ActivityType, StyleSet> = {
  league_game:     { bg: "bg-emerald-100", border: "border-emerald-500", icon: "⚽", label: "League" },
  tournament_game: { bg: "bg-emerald-100", border: "border-emerald-500", icon: "🏆", label: "Tournament" },
  drop_in:         { bg: "bg-purple-100",  border: "border-purple-500",  icon: "🎯", label: "Drop-in" },
  class:           { bg: "bg-blue-100",    border: "border-blue-500",    icon: "🏫", label: "Class" },
  camp:            { bg: "bg-blue-100",    border: "border-blue-500",    icon: "🏕", label: "Camp" },
  rental:          { bg: "bg-amber-100",   border: "border-amber-500",   icon: "🔑", label: "Rental" },
  external:        { bg: "bg-slate-100",   border: "border-slate-500",   icon: "🤝", label: "External" },
  maintenance:     { bg: "bg-stone-200",   border: "border-stone-500",   icon: "🔧", label: "Maintenance" },
}

type Props = {
  type: ActivityType
  title: string
  subtitle: string
  capacityCurrent?: number | null
  capacityMax?: number | null
  refWarning?: boolean
  primaryActionLabel?: string
  href?: string
  onPrimary?: () => void
  /** Manual (external/maintenance) holds only — renders a remove control. */
  onDelete?: () => void
}

export function ActivityBlock(props: Props) {
  const style = STYLES[props.type]
  const cap =
    typeof props.capacityCurrent === "number" && typeof props.capacityMax === "number"
      ? `${props.capacityCurrent}/${props.capacityMax}`
      : typeof props.capacityMax === "number"
        ? `cap ${props.capacityMax}`
        : null

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 ${style.bg} border-l-4 ${style.border} rounded p-3`}
    >
      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
        <div className="text-lg" aria-hidden>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              {style.label}
            </span>
            <span className="font-medium text-ink truncate">{props.title}</span>
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {[props.subtitle, cap].filter(Boolean).join(" · ")}
            {props.refWarning && (
              <span className="ml-2 text-red-600 font-medium">⚠ Ref unassigned</span>
            )}
          </div>
        </div>
      </div>
      {props.onDelete && (
        <button
          onClick={props.onDelete}
          aria-label="Remove hold"
          title="Remove hold"
          className="sm:self-center px-3 py-2 border border-border text-ink-muted hover:text-red-600 hover:border-red-300 rounded text-sm font-medium min-h-[44px]"
        >
          Remove
        </button>
      )}
      {props.primaryActionLabel &&
        (props.href ? (
          <a
            href={props.href}
            className="sm:self-center px-3 py-2 bg-ink text-cream rounded text-sm font-medium min-h-[44px] inline-flex items-center justify-center"
          >
            {props.primaryActionLabel}
          </a>
        ) : (
          <button
            onClick={props.onPrimary}
            className="sm:self-center px-3 py-2 bg-ink text-cream rounded text-sm font-medium min-h-[44px]"
          >
            {props.primaryActionLabel}
          </button>
        ))}
    </div>
  )
}
