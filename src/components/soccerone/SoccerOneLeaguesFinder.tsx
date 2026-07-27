"use client"
import { useEffect, useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
import { formatDateOnly, formatDaySchedule } from "@/lib/time/format-date"
import SoccerOneInterestCapture from "@/components/soccerone/SoccerOneInterestCapture"
import SoccerOneLevelLadder from "@/components/soccerone/SoccerOneLevelLadder"
import { SoCardShell, SoCardTitle, SoBadge, SoStatusPill, SoCardStyles } from "@/components/soccerone/SoCard"
import { trackDivisionRegisterClicked, trackDivisionFilterApplied } from "@/lib/analytics/events"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, deriveLevelChips, deriveAgesChips, filterSeasons,
  NIGHT_LABELS, type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"
import { WEEK_ORDER } from "@/lib/leagues/division-filters"
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"

const SECTION_ID = "leagues-finder"
const ALL: FinderFilters = { location: "all", division: "all", night: "all", level: "all", ages: "all" }

export default function SoccerOneLeaguesFinder({ seasons }: { seasons: FinderSeason[] }) {
  useHydrationBeacon()
  const [filters, setFilters] = useState<FinderFilters>(ALL)
  const [arrivedFrom, setArrivedFrom] = useState<string | null>(null)

  // ?location= deep-link. Applied after mount, NOT in the useState
  // initializers: the server renders the unfiltered list (it has no query
  // context in the island), so a first client render that filters would
  // diverge from the SSR HTML and throw a React hydration error (#418).
  useEffect(() => {
    const loc = new URLSearchParams(window.location.search).get("location")
    if (loc) {
      setFilters((f) => ({ ...f, location: loc }))
      setArrivedFrom(loc)
    }
  }, [])

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
  // Renders only when the catalog mixes audiences (term pages fetch without
  // an audience filter — prod winter pages mixed 23 adult+youth cards).
  const agesChips = useMemo(() => deriveAgesChips(seasons), [seasons])
  // Levels present in the catalog gate the ladder: on a catalog with no
  // skill levels at all (e.g. staging fixtures), an interactive ladder would
  // filter everything to zero — render nothing instead.
  const hasLevels = useMemo(() => deriveLevelChips(seasons).length > 0, [seasons])
  const visible = useMemo(() => filterSeasons(seasons, filters), [seasons, filters])

  // Group the visible leagues under day-of-week section headers (mon→sun),
  // day-TBD last — the day is the primary way players scan for a league.
  const dayGroups = useMemo(() => {
    const groups = WEEK_ORDER.map((day) => ({
      key: day as string,
      label: NIGHT_LABELS[day],
      items: visible.filter((s) => s.dayOfWeek === day),
    })).filter((g) => g.items.length > 0)
    const tbd = visible.filter((s) => !s.dayOfWeek)
    if (tbd.length) groups.push({ key: "tbd", label: "Day TBD", items: tbd })
    return groups
  }, [visible])

  // Map the finder's axes onto the shared analytics facet vocabulary so
  // Aspire and SoccerOne filter events aggregate in the same funnel view.
  const FACET_FOR: Record<keyof FinderFilters, "level" | "format" | "day" | "venue" | "ages"> = {
    location: "venue",
    division: "format",
    night: "day",
    level: "level",
    ages: "ages",
  }

  const set = (axis: keyof FinderFilters, value: string) => {
    // term is "" on the flat catalog — the season tier passes a real term.
    trackDivisionFilterApplied({ facet: FACET_FOR[axis], value, term: "" })
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? "all" : value }))
  }

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

        .leagues-day-sections { display: flex; flex-direction: column; gap: 2.5rem; }
        .leagues-day-group { display: flex; flex-direction: column; gap: 1.25rem; }
        .leagues-day-header {
          display: flex; align-items: center; gap: 0.75rem;
          font-family: var(--so-font-display);
          font-size: 1.5rem;
          color: #ffffff;
          letter-spacing: 0.02em;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--so-lime-a20);
        }
        .ldh-count {
          font-family: var(--so-font-mono);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--so-lime);
          background: var(--so-lime-a08);
          border: 1px solid var(--so-lime-a20);
          border-radius: 99px;
          padding: 2px 9px;
        }

        .leagues-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }

        /* League card shell/badge/status/title anatomy lives in SoCard.tsx
           (<SoCardStyles /> below) — only this finder's own layout classes
           (grid, meta rows, detail rows, CTA) stay local. */

        .lc-meta-row { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }

        .lc-meta-line { display: flex; align-items: center; gap: 0.5rem; }
        .lc-meta-sep { color: rgba(255,255,255,0.25); }
        .lc-meta-text { font-size: 0.875rem; font-weight: 600; color: rgba(255,255,255,0.7); }

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
        .lc-done { font-family: var(--so-font-mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); padding: 0.625rem 0; }

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
      <SoCardStyles />
      {arrivedFrom && (
        <div className="so-finder-arrived">
          Showing leagues at <strong>{locationChips.find(c => c.value === arrivedFrom)?.label ?? arrivedFrom}</strong>
          <button type="button" aria-label="Clear location filter" onClick={() => { setFilters(ALL); setArrivedFrom(null) }}>clear ✕</button>
        </div>
      )}

      {hasLevels && (
        <div className="so-finder-group">
          <span className="so-finder-glabel">Find your level — click to filter</span>
          {/* The ladder IS the level filter. It replaced the old flat "Level"
              chip row, which asked the same question twice in two visual
              languages. `set` toggles back to "all" on re-click, so clicking
              the active tier clears it — same contract as the chips. */}
          <SoccerOneLevelLadder selected={filters.level} onSelect={(v) => set("level", v)} />
        </div>
      )}
      <ChipRow label="Ages" chips={agesChips} active={filters.ages ?? "all"} onPick={(v) => set("ages", v)} />
      <ChipRow label="Location" chips={locationChips} active={filters.location} onPick={(v) => set("location", v)} />
      <ChipRow label="Division" chips={divisionChips} active={filters.division} onPick={(v) => set("division", v)} />
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
        <div className="leagues-day-sections">
          {dayGroups.map((g) => (
            <section key={g.key} className="leagues-day-group" aria-label={`${g.label} leagues`}>
              <h3 className="leagues-day-header">
                <span className="ldh-label">{g.label}</span>
                <span className="ldh-count">{g.items.length}</span>
              </h3>
              <div className="leagues-grid">
                {g.items.map((s) => <LeagueCard key={s.id} season={s as LeagueCardSeason} />)}
              </div>
            </section>
          ))}
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
  program: { name: string; audienceType?: string | null }
  startDate: string | null
  startTime: string | null
  endTime: string | null
  scheduleNotes: string | null
  spotsLeft: number | null
  maxParticipants: number | null
  price: number
  teamPrice: number | null
  termSlug: string | null
  signupModes: string[] | null
  /** "register" for open seasons, "interest" for forming ones. */
  signupMode: string
  /** Team early-bird window live right now (display only). */
  teamEarlyBirdActive?: boolean
  /** Team fee the charge path would use right now (early-bird while active). */
  effectiveTeamPrice?: number | null
}

// Mirror of leagues.astro:224-267, as JSX. `season` carries the presentational
// fields (name, status, program, startDate, scheduleNotes, spotsLeft,
// maxParticipants, price, teamPrice) from /api/public/seasons.
function LeagueCard({ season }: { season: LeagueCardSeason }) {
  const [capturing, setCapturing] = useState(false)
  const isDowntown = season.location.slug?.includes("downtown")
  const forming = season.signupMode === "interest"
  const completed = season.status === "completed"
  const statusKey = season.status === "open" ? "open" : season.status === "filling" ? "filling" : "coming"
  // Show the team fee the charge path would actually use — the early-bird
  // price while its window is live, labelled as such. Display only; the
  // charge path recomputes server-side from the same helpers.
  const earlyBird = season.teamEarlyBirdActive && season.effectiveTeamPrice != null
  const teamFee = earlyBird ? season.effectiveTeamPrice : season.teamPrice
  const priceLabel = teamFee
    ? `$${season.price}/player · team: $${CAPTAIN_DEPOSIT_DOLLARS} reserves it, $${teamFee} total${earlyBird ? " early-bird" : ""}`
    : `$${season.price}/player`
  const dayLabel = formatDaySchedule(season.dayOfWeek, season.startTime, season.endTime)
  // Day/time and starts are separate meta rows in the canonical order (day/
  // time, then starts) and always render — a fallback em-dash keeps every
  // card in a grid row the same height instead of some cards growing an
  // extra row when a field is missing (the ragged-grid bug this task fixes).
  const dayOrScheduleLabel = dayLabel || season.scheduleNotes || "—"
  // Freeform schedule notes get the honest label; a real play day says DAY.
  const dayRowLabel = dayLabel ? "DAY" : season.scheduleNotes ? "SCHEDULE" : "DAY"
  const startsLabel = season.startDate ? formatDateOnly(season.startDate) : "—"
  // Same content as the old "PROGRAM" row (program.name) — just relocated
  // into the canonical "venue · X" meta row instead of its own row.
  const divisionLabel = season.program.name
  return (
    <SoCardShell variant="league" modifier={isDowntown ? "downtown" : "active"}>
      {/* 1. title (clamped, reserved height) */}
      <SoCardTitle variant="league">{season.name}</SoCardTitle>

      {/* 2. venue · program — this league card's analog of the canonical
          "venue · age" row (program.name is the closest SoccerOne field to
          Aspire's age-group classifier). Venue is plain text, never a link:
          /locations/{slug} renders full Aspire-branded marketing copy (see
          [slug].astro) with no brand/host check, so linking it from a
          SoccerOne card would send a SoccerOne visitor to what reads as a
          different company's page. */}
      <div className="lc-meta-line">
        <SoBadge kind={isDowntown ? "tag-downtown" : "tag"}>{season.location.name.toUpperCase()}</SoBadge>
        <span className="lc-meta-sep">·</span>
        <span className="lc-meta-text">{divisionLabel}</span>
      </div>

      <div className="lc-details">
        {/* 3. day/time */}
        <div className="lc-detail-row"><span className="lcd-label">{dayRowLabel}</span><span className="lcd-val">{dayOrScheduleLabel}</span></div>
        {/* 4. starts */}
        <div className="lc-detail-row"><span className="lcd-label">STARTS</span><span className="lcd-val">{startsLabel}</span></div>
      </div>

      {/* 5. chip row: status + level/youth badges — always rendered */}
      <div className="lc-meta-row">
        {season.program?.audienceType === "parents" && <SoBadge kind="outline">Youth</SoBadge>}
        {season.skillLevel && (
          <SoBadge kind="outline">{season.skillLevel === "open" ? "Open" : String(season.skillLevel).toUpperCase()}</SoBadge>
        )}
        <SoStatusPill tone={statusKey}>{String(season.status).toUpperCase()}</SoStatusPill>
      </div>

      {!completed && (
        <div className="lc-details">
          <div className="lc-detail-row"><span className="lcd-label">SPOTS</span><span className="lcd-val">{season.spotsLeft != null ? `${season.spotsLeft} left of ${season.maxParticipants}` : "Open"}</span></div>
        </div>
      )}

      {/* 6. price band */}
      <div className="lc-details">
        <div className="lc-detail-row"><span className="lcd-label">PRICE</span><span className="lcd-val mono accent">{priceLabel}</span></div>
      </div>

      {/* 7. CTA */}
      {completed ? (
        // Archive state: no CTA at all — a register link over a finished
        // season is exactly the dead-button class this page's comments ban.
        <span className="lc-done">Season complete</span>
      ) : forming ? (
        <>
          <button
            type="button"
            className="lc-cta"
            aria-expanded={capturing}
            onClick={() => {
              trackDivisionRegisterClicked({
                seasonId: season.id,
                level: season.skillLevel ?? "open",
                gender: season.divisionGender ?? "unknown",
                venue: season.location.slug,
                mode: "interest",
                term: season.termSlug ?? "",
              })
              setCapturing((v) => !v)
            }}
          >Notify me →</button>
          {capturing && (
            <SoccerOneInterestCapture
              seasonId={season.id}
              source="league-card-forming"
              title="Get on the list"
              subtitle="One email the day registration opens — nothing else."
            />
          )}
        </>
      ) : (
        <a
          href={`/register/${season.id}`}
          className="lc-cta"
          onClick={() =>
            trackDivisionRegisterClicked({
              seasonId: season.id,
              level: season.skillLevel ?? "open",
              gender: season.divisionGender ?? "unknown",
              venue: season.location.slug,
              mode: season.signupModes?.includes("team") ? "team" : "individual",
              term: season.termSlug ?? "",
            })
          }
        >Register Now →</a>
      )}
    </SoCardShell>
  )
}

function SoccerOneFinderEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="so-finder-empty">
      <p className="le-title">No leagues match</p>
      <p className="le-body">Try widening a filter — or leave your email and we'll tell you when a new season opens.</p>
      <button type="button" className="lc-cta" onClick={onClear}>Clear filters</button>
      <div style={{ maxWidth: 480, margin: "1.25rem auto 0", textAlign: "left" }}>
        {/* No seasonId: nothing specific to point season-interest at — feeds
            the newsletter list tagged with the slot source. The copy above
            promised this field long before it existed; now it does. */}
        <SoccerOneInterestCapture
          source="leagues-empty-state"
          title="Tell me when a season opens"
          subtitle="One email the day registration opens — nothing else."
        />
      </div>
    </div>
  )
}
