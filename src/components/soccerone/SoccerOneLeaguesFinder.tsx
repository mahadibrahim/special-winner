"use client"
import { useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, deriveLevelChips, filterSeasons,
  type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const SECTION_ID = "leagues-finder"
const ALL: FinderFilters = { location: "all", division: "all", night: "all", level: "all" }

export default function SoccerOneLeaguesFinder({ seasons }: { seasons: FinderSeason[] }) {
  useHydrationBeacon()
  const [filters, setFilters] = useState<FinderFilters>(() => {
    if (typeof window === "undefined") return ALL
    const loc = new URLSearchParams(window.location.search).get("location")
    return loc ? { ...ALL, location: loc } : ALL
  })
  const [arrivedFrom, setArrivedFrom] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("location")
  })

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
  const levelChips = useMemo(() => deriveLevelChips(seasons), [seasons])
  const visible = useMemo(() => filterSeasons(seasons, filters), [seasons, filters])

  const set = (axis: keyof FinderFilters, value: string) =>
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? "all" : value }))

  return (
    <section id={SECTION_ID} className="so-finder" aria-label="Find a league">
      <style>{`
        .so-finder { max-width: 1400px; margin: 0 auto; padding: 2rem; }
        .so-finder-group { margin-bottom: 0.875rem; }
        .so-finder-glabel { font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--so-lime-a50); display: block; margin-bottom: 0.5rem; }
        .so-finder-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .so-chip { font-family: var(--so-font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: var(--so-surface); border: 1px solid var(--so-lime-a15); border-radius: 99px; padding: 0.5rem 0.9rem; cursor: pointer; transition: all 0.14s; }
        .so-chip:hover { border-color: var(--so-lime-a40); }
        .so-chip.on { background: var(--so-lime); color: var(--so-ink); border-color: var(--so-lime); font-weight: 600; }
        .so-finder-count { font-family: var(--so-font-mono); font-size: 0.8rem; color: rgba(255,255,255,0.45); margin: 1rem 0; }
        .so-finder-count strong { color: var(--so-lime); }
        .so-finder-clear, .so-finder-arrived button { background: none; border: none; color: rgba(255,255,255,0.45); text-decoration: underline; cursor: pointer; margin-left: 0.75rem; font-size: 0.8rem; }
        .so-finder-arrived { display: flex; align-items: center; gap: 0.5rem; background: var(--so-lime-a08); border: 1px solid var(--so-lime-a30); border-radius: var(--so-radius-md); padding: 0.625rem 0.875rem; margin-bottom: 1rem; font-family: var(--so-font-mono); font-size: 0.75rem; color: var(--so-lime); }
        .so-finder-arrived button { margin-left: auto; }
        .so-finder-empty { padding: 3rem 0; text-align: center; }

        .leagues-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }

        .league-card {
          background: var(--so-surface);
          border: 1px solid var(--so-lime-a20);
          border-left: 3px solid var(--so-lime);
          border-radius: var(--so-radius-lg);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: relative;
          transition: border-color 0.2s, transform 0.2s;
        }
        .league-card:hover { border-color: var(--so-lime-a40); border-left-color: var(--so-lime); transform: translateY(-4px); }
        .league-card--active { border-color: var(--so-lime-a15); }
        .league-card--downtown { border-color: rgba(100,160,255,0.2); border-left-color: rgba(100,160,255,0.8); }
        .league-card--downtown:hover { border-color: rgba(100,160,255,0.4); border-left-color: rgba(100,160,255,1); }
        .league-card--youth { border-color: rgba(192,132,252,0.2); border-left-color: rgba(192,132,252,0.8); }

        .lc-location-badge {
          font-family: var(--so-font-mono);
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          background: var(--so-lime-a08);
          color: var(--so-lime-a60);
          border: 1px solid var(--so-lime-a15);
          padding: 2px 7px;
          border-radius: 3px;
          display: inline-block;
          width: fit-content;
        }
        .lc-location-badge--downtown {
          background: rgba(100,160,255,0.08);
          color: rgba(147,197,253,0.7);
          border-color: rgba(100,160,255,0.15);
        }

        .lc-level-badge {
          font-family: var(--so-font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          color: var(--so-lime);
          border: 1px solid var(--so-lime-a30);
          border-radius: 99px;
          padding: 2px 7px;
        }

        .lc-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }

        .lc-division { display: flex; flex-direction: column; gap: 2px; }
        .lc-div-label { font-family: var(--so-font-mono); font-size: 0.5rem; font-weight: 600; letter-spacing: 0.1em; color: rgba(255,255,255,0.3); }
        .lc-div-name { font-size: 0.875rem; font-weight: 600; color: rgba(255,255,255,0.7); }

        .lc-status {
          font-family: var(--so-font-mono);
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          padding: 3px 8px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .lc-status--open { background: var(--so-lime-a12); color: var(--so-lime); border: 1px solid var(--so-lime-a20); }
        .lc-status--filling { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
        .lc-status--coming { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.1); }

        .lc-name {
          font-family: var(--so-font-display);
          font-size: 1.75rem;
          color: #ffffff;
          letter-spacing: 0.01em;
          line-height: 1;
        }

        .lc-desc {
          font-size: 0.9375rem;
          color: rgba(255,255,255,0.45);
          line-height: 1.55;
          flex: 1;
        }

        .lc-details { display: flex; flex-direction: column; gap: 0.5rem; }
        .lc-detail-row {
          display: grid;
          grid-template-columns: 60px 1fr;
          gap: 0.625rem;
          align-items: start;
        }
        .lcd-label { font-family: var(--so-font-mono); font-size: 0.5rem; font-weight: 600; letter-spacing: 0.1em; color: var(--so-lime-a50); padding-top: 2px; }
        .lcd-val { font-size: 0.875rem; color: rgba(255,255,255,0.65); line-height: 1.4; }
        .lcd-val.mono { font-family: var(--so-font-mono); font-size: 0.8125rem; }
        .lcd-val.accent { color: var(--so-lime); }

        .lc-cta {
          display: inline-flex;
          align-items: center;
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--so-lime);
          text-decoration: none;
          padding: 0.625rem 0;
          border-bottom: 1px solid var(--so-lime-a25);
          transition: border-color 0.15s;
          width: fit-content;
          cursor: pointer;
          background: none;
          border-left: none;
          border-right: none;
          border-top: none;
        }
        .lc-cta:hover { border-bottom-color: var(--so-lime); }

        .le-title {
          font-family: var(--so-font-display);
          font-size: 1.5rem;
          color: #ffffff;
          letter-spacing: 0.01em;
          margin-bottom: 0.5rem;
        }
        .le-body {
          font-size: 0.9375rem;
          color: rgba(255,255,255,0.45);
        }

        @media (max-width: 1100px) { .leagues-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 768px) { .leagues-grid { grid-template-columns: 1fr; } }
      `}</style>
      {arrivedFrom && (
        <div className="so-finder-arrived">
          Showing leagues at <strong>{locationChips.find(c => c.value === arrivedFrom)?.label ?? arrivedFrom}</strong>
          <button type="button" aria-label="Clear location filter" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear ✕</button>
        </div>
      )}

      <ChipRow label="Location" chips={locationChips} active={filters.location} onPick={(v) => set("location", v)} />
      <ChipRow label="Division" chips={divisionChips} active={filters.division} onPick={(v) => set("division", v)} />
      <ChipRow label="Level" chips={levelChips} active={filters.level} onPick={(v) => set("level", v)} />
      <ChipRow label="Night" chips={nightChips} active={filters.night} onPick={(v) => set("night", v)} />

      <p className="so-finder-count">
        <strong>{visible.length}</strong> of {seasons.length} leagues
        {(filters.location !== "all" || filters.division !== "all" || filters.level !== "all" || filters.night !== "all") && (
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0 }}>
          {season.skillLevel && (
            <span className="lc-level-badge">
              {season.skillLevel === "open" ? "Open" : String(season.skillLevel).toUpperCase()}
            </span>
          )}
          <span className={`lc-status lc-status--${statusKey}`}>{String(season.status).toUpperCase()}</span>
        </div>
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
