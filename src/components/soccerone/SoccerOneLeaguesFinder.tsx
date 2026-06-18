"use client"
import { useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, filterSeasons,
  type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const SECTION_ID = "leagues-finder"
const ALL: FinderFilters = { location: "all", division: "all", night: "all" }

export default function SoccerOneLeaguesFinder({ seasons }: { seasons: FinderSeason[] }) {
  useHydrationBeacon()
  const [filters, setFilters] = useState<FinderFilters>(() => {
    if (typeof window === "undefined") return ALL
    const loc = new URLSearchParams(window.location.search).get("location")
    return loc ? { ...ALL, location: loc } : ALL
  })
  const [arrivedFrom, setArrivedFrom] = useState<string | null>(null)

  // Hero deep-link: a launchpad quick-link dispatches { key, sectionId, location }.
  // Only react when this section is the target; pre-fill the location chip.
  useFinderFilter((detail) => {
    if (detail.sectionId !== SECTION_ID) return
    if (detail.location) {
      setFilters((f) => ({ ...f, location: detail.location! }))
      setArrivedFrom(detail.location!)
    }
  })

  const locationChips = useMemo(() => deriveLocationChips(seasons), [seasons])
  const divisionChips = useMemo(() => deriveDivisionChips(seasons), [seasons])
  const nightChips = useMemo(() => deriveNightChips(seasons), [seasons])
  const visible = useMemo(() => filterSeasons(seasons, filters), [seasons, filters])

  const set = (axis: keyof FinderFilters, value: string) =>
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? "all" : value }))

  return (
    <section id={SECTION_ID} className="so-finder" aria-label="Find a league">
      {arrivedFrom && (
        <div className="so-finder-arrived">
          Showing leagues at <strong>{locationChips.find(c => c.value === arrivedFrom)?.label ?? arrivedFrom}</strong>
          <button type="button" aria-label="Clear location filter" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear ✕</button>
        </div>
      )}

      <ChipRow label="Location" chips={locationChips} active={filters.location} onPick={(v) => set("location", v)} />
      <ChipRow label="Division" chips={divisionChips} active={filters.division} onPick={(v) => set("division", v)} />
      <ChipRow label="Night" chips={nightChips} active={filters.night} onPick={(v) => set("night", v)} />

      <p className="so-finder-count">
        <strong>{visible.length}</strong> of {seasons.length} leagues
        {(filters.location !== "all" || filters.division !== "all" || filters.night !== "all") && (
          <button type="button" className="so-finder-clear" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear filters</button>
        )}
      </p>

      {visible.length === 0 ? (
        <SoccerOneFinderEmpty onClear={() => { setFilters(ALL); setArrivedFrom(null) }} />
      ) : (
        <div className="leagues-grid">
          {visible.map((s) => <LeagueCard key={s.id} season={s as LeagueCardSeason} />)}
        </div>
      )}
    </section>
  )
}

function ChipRow({ label, chips, active, onPick }: {
  label: string; chips: { value: string; label: string }[]; active: string; onPick: (v: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="so-finder-group">
      <span className="so-finder-glabel">{label}</span>
      <div className="so-finder-chips" role="group" aria-label={label}>
        <button type="button" className={`so-chip ${active === "all" ? "on" : ""}`} onClick={() => onPick("all")} aria-pressed={active === "all"}>All</button>
        {chips.map((c) => (
          <button key={c.value} type="button" className={`so-chip ${active === c.value ? "on" : ""}`}
            onClick={() => onPick(c.value)} aria-pressed={active === c.value}>{c.label}</button>
        ))}
      </div>
    </div>
  )
}

interface LeagueCardSeason extends FinderSeason {
  name: string
  status: string
  program: { name: string }
  startDate: string | null
  scheduleNotes: string | null
  spotsLeft: number | null
  maxParticipants: number | null
  price: number
  teamPrice: number | null
}

// Mirror of leagues.astro:224-267, as JSX. `season` carries the presentational
// fields (name, status, program, startDate, scheduleNotes, spotsLeft,
// maxParticipants, price, teamPrice) from /api/public/seasons.
function LeagueCard({ season }: { season: LeagueCardSeason }) {
  const isDowntown = season.location.slug?.includes("downtown")
  const statusKey = season.status === "open" ? "open" : season.status === "filling" ? "filling" : "coming"
  const priceLabel = season.teamPrice ? `$${season.price}/player · $${season.teamPrice}/team` : `$${season.price}/player`
  return (
    <div className={`league-card ${isDowntown ? "league-card--downtown" : "league-card--active"}`}>
      <div className={`lc-location-badge ${isDowntown ? "lc-location-badge--downtown" : ""}`}>{season.location.name.toUpperCase()}</div>
      <div className="lc-top">
        <div className="lc-division"><span className="lc-div-label">PROGRAM</span><span className="lc-div-name">{season.program.name}</span></div>
        <span className={`lc-status lc-status--${statusKey}`}>{String(season.status).toUpperCase()}</span>
      </div>
      <h3 className="lc-name">{season.name}</h3>
      <div className="lc-details">
        {season.startDate && <div className="lc-detail-row"><span className="lcd-label">STARTS</span><span className="lcd-val">{new Date(season.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>}
        {season.scheduleNotes && <div className="lc-detail-row"><span className="lcd-label">SCHEDULE</span><span className="lcd-val">{season.scheduleNotes}</span></div>}
        <div className="lc-detail-row"><span className="lcd-label">SPOTS</span><span className="lcd-val">{season.spotsLeft != null ? `${season.spotsLeft} left of ${season.maxParticipants}` : "Open"}</span></div>
        <div className="lc-detail-row"><span className="lcd-label">PRICE</span><span className="lcd-val mono accent">{priceLabel}</span></div>
      </div>
      <a href={`/register/${season.id}`} className="lc-cta">Register Now →</a>
    </div>
  )
}

function SoccerOneFinderEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="so-finder-empty">
      <p className="le-title">No leagues match</p>
      <p className="le-body">Try widening a filter — or leave your email and we'll tell you when a new season opens.</p>
      <button type="button" className="lc-cta" onClick={onClear}>Clear filters</button>
    </div>
  )
}
