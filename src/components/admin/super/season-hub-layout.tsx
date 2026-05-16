"use client"

import { useState } from "react"

export type SeasonHubTab =
  | "registrations"
  | "teams"
  | "schedule"
  | "pricing"
  | "communications"
  | "refunds"
  | "settings"

const TABS: { id: SeasonHubTab; label: string }[] = [
  { id: "registrations", label: "Registrations" },
  { id: "teams", label: "Teams & rosters" },
  { id: "schedule", label: "Schedule" },
  { id: "pricing", label: "Pricing & codes" },
  { id: "communications", label: "Communications" },
  { id: "refunds", label: "Refunds" },
  { id: "settings", label: "Settings" },
]

export type SeasonHeader = {
  id: string
  name: string
  programName: string
  sportName: string
  locationName: string
  status: string
  startDate: string
  endDate: string
}

export type SeasonStats = {
  capacityCurrent: number
  capacityMax: number | null
  revenueCents: number
  teams: number
  games: number
  waitlistCount: number
  refundsPending: number
}

type Props = {
  season: SeasonHeader
  stats: SeasonStats
  tabContents: Record<SeasonHubTab, React.ReactNode>
  initialTab?: SeasonHubTab
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-cream text-ink-muted",
  open: "bg-emerald-100 text-emerald-800",
  active: "bg-blue-100 text-blue-800",
  closed: "bg-gray-100 text-gray-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-rose-100 text-rose-800",
}

export function SeasonHubLayout({ season, stats, tabContents, initialTab = "registrations" }: Props) {
  const [active, setActive] = useState<SeasonHubTab>(initialTab)
  const statusStyle = STATUS_STYLES[season.status] ?? STATUS_STYLES.draft

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold">
            {season.locationName} · {season.sportName} · {season.programName}
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink">{season.name}</h1>
          <div className="mt-1 flex gap-2 items-center flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${statusStyle}`}>
              {season.status}
            </span>
            <span className="text-xs text-ink-muted">
              {season.startDate} – {season.endDate}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={`/admin/seasons/${season.id}/edit`}
            className="px-3 py-2 border border-border bg-white rounded text-sm text-ink min-h-[44px] inline-flex items-center"
          >
            Edit season
          </a>
          <a
            href={`/admin/announcements?seasonId=${season.id}`}
            className="px-3 py-2 bg-ink text-cream rounded text-sm font-medium min-h-[44px] inline-flex items-center"
          >
            Send announcement
          </a>
        </div>
      </div>

      {/* Key facts strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border rounded overflow-hidden">
        <KeyFact
          label="Capacity"
          value={
            stats.capacityMax !== null
              ? `${stats.capacityCurrent} / ${stats.capacityMax}`
              : `${stats.capacityCurrent}`
          }
        />
        <KeyFact label="Revenue" value={`$${(stats.revenueCents / 100).toLocaleString()}`} />
        <KeyFact label="Teams" value={stats.teams.toString()} />
        <KeyFact label="Games" value={stats.games.toString()} />
        <KeyFact label="Waitlist" value={stats.waitlistCount.toString()} />
      </div>

      {/* Tabs */}
      <div role="tablist" className="border-b border-border flex gap-4 overflow-x-auto">
        {TABS.map((t) => {
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={`py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-ink text-ink font-semibold"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.id === "refunds" && stats.refundsPending > 0 && (
                <span className="ml-1 opacity-70">({stats.refundsPending})</span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">{tabContents[active]}</div>
    </div>
  )
}

function KeyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div className="text-xl font-semibold text-ink mt-0.5">{value}</div>
    </div>
  )
}
