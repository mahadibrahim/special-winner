"use client"

export type SeasonStatus =
  | "draft"
  | "open"
  | "closed"
  | "active"
  | "completed"
  | "cancelled"

export type SeasonCard = {
  id: string
  programName: string
  seasonLabel: string
  locationName: string
  status: SeasonStatus
  capacityCurrent: number
  capacityMax: number | null
  daysLeft: number | null
}

type Props = { seasons: SeasonCard[] }

const STATUS_STYLES: Record<SeasonStatus, { bg: string; text: string; label: string }> = {
  draft:      { bg: "bg-cream",       text: "text-ink-muted",  label: "Draft" },
  open:       { bg: "bg-emerald-100", text: "text-emerald-800", label: "Registration open" },
  active:     { bg: "bg-blue-100",    text: "text-blue-800",    label: "In season" },
  closed:     { bg: "bg-gray-100",    text: "text-gray-700",    label: "Closed" },
  completed:  { bg: "bg-gray-100",    text: "text-gray-700",    label: "Completed" },
  cancelled:  { bg: "bg-rose-100",    text: "text-rose-800",    label: "Cancelled" },
}

export function SeasonsGrid({ seasons }: Props) {
  if (seasons.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Seasons</h2>
        <div className="bg-white border border-border rounded p-6 text-sm text-ink-muted italic">
          No seasons yet. <a href="/admin/seasons/new" className="underline">Create one →</a>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink">Seasons</h2>
        <a href="/admin/seasons" className="text-sm underline">View all →</a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {seasons.map((s) => {
          const pct =
            s.capacityMax && s.capacityMax > 0
              ? Math.round((s.capacityCurrent / s.capacityMax) * 100)
              : 0
          const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.draft
          return (
            <a
              key={s.id}
              href={`/admin/seasons/${s.id}`}
              className="block bg-white border border-border rounded p-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex justify-between items-start mb-1.5 gap-2">
                <span
                  className={`text-[9px] uppercase tracking-wider font-semibold ${style.bg} ${style.text} px-1.5 py-0.5 rounded`}
                >
                  {style.label}
                </span>
                <span className="text-[10px] text-ink-muted truncate">{s.locationName}</span>
              </div>
              <div className="font-medium text-sm text-ink leading-tight">{s.programName}</div>
              <div className="text-xs text-ink-muted mt-0.5">{s.seasonLabel}</div>
              <div className="mt-2 h-1 bg-cream rounded overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
                <span>
                  {s.capacityCurrent}
                  {s.capacityMax !== null ? ` / ${s.capacityMax}` : ""}
                </span>
                {s.daysLeft !== null && <span>{s.daysLeft}d left</span>}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
