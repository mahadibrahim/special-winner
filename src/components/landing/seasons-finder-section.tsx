"use client"

import { useEffect, useMemo, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { FilterChips, type ChipOption } from "./filter-chips"
import type { ApiSeason } from "./adult-finder"

const PAGE_SIZE = 6

/**
 * One finder section backed by the seasons catalog. Used by BOTH finders:
 *   • /adult — one section per program type (Leagues, Tournaments). Each is
 *     pre-filtered to a single `programType`, so the Format chip auto-hides.
 *   • /youth — one section per age band. Each contains mixed program types,
 *     so the Format chip shows (Leagues / Classes / Camps / Clinics / …).
 *
 * The parent passes an already-scoped season list; this component owns the
 * per-section chip filters (Format · Sport · Venue), pagination, and the
 * loading/empty states. Every chip group auto-hides when it has ≤1 option.
 *
 * No "Day"/"Month" filter: the only schedule signal on a season record is
 * the free-text `scheduleNotes`; the structured `startDate` is the record's
 * start date, not the game/event day, so a filter derived from it would
 * contradict what the card displays.
 */

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  league: "Leagues",
  training: "Classes",
  camp: "Camps",
  clinic: "Clinics",
  tournament: "Tournaments",
}

function programTypeLabel(programType: string): string {
  return (
    PROGRAM_TYPE_LABELS[programType] ??
    programType.charAt(0).toUpperCase() + programType.slice(1)
  )
}

function venueLabel(s: ApiSeason): string {
  return s.location.name.replace(/^Soccer One\s+/i, "")
}

function buildOptions(
  seasons: ApiSeason[],
  keyOf: (s: ApiSeason) => string | null,
  labelOf: (s: ApiSeason) => string,
): ChipOption[] {
  const acc = new Map<string, { label: string; count: number }>()
  for (const s of seasons) {
    const key = keyOf(s)
    if (!key) continue
    const existing = acc.get(key)
    if (existing) existing.count++
    else acc.set(key, { label: labelOf(s), count: 1 })
  }
  return [...acc.entries()].map(([value, { label, count }]) => ({ value, label, count }))
}

interface SeasonsFinderSectionProps {
  id: string
  /** Optional leading glyph for the heading. Omitted for age-band sections. */
  icon?: string
  title: string
  descriptor: string
  seasons: ApiSeason[]
  loading: boolean
}

export function SeasonsFinderSection({
  id,
  icon,
  title,
  descriptor,
  seasons,
  loading,
}: SeasonsFinderSectionProps) {
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [activeVenue, setActiveVenue] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Reset pagination whenever a filter changes — without this, narrowing
  // from a long list to a short one leaves the visitor scrolled past the
  // new first row.
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeFormat, activeSport, activeVenue])

  const formatOptions = useMemo(
    () =>
      buildOptions(
        seasons,
        (s) => s.program.programType,
        (s) => programTypeLabel(s.program.programType),
      ),
    [seasons],
  )
  const sportOptions = useMemo(
    () => buildOptions(seasons, (s) => s.sport.slug, (s) => s.sport.name),
    [seasons],
  )
  const venueOptions = useMemo(
    () => buildOptions(seasons, (s) => s.location.slug, venueLabel),
    [seasons],
  )

  const filtered = useMemo(() => {
    return seasons.filter((s) => {
      if (activeFormat && s.program.programType !== activeFormat) return false
      if (activeSport && s.sport.slug !== activeSport) return false
      if (activeVenue && s.location.slug !== activeVenue) return false
      return true
    })
  }, [seasons, activeFormat, activeSport, activeVenue])

  const clearFilters = () => {
    setActiveFormat(null)
    setActiveSport(null)
    setActiveVenue(null)
  }
  const hasActiveFilters =
    activeFormat !== null || activeSport !== null || activeVenue !== null

  return (
    <section id={id} className="scroll-mt-36 py-12 lg:py-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl lg:text-3xl text-ink">
            {icon && <span aria-hidden="true" className="mr-2">{icon}</span>}
            {title}
          </h2>
          {!loading && (
            <span className="text-sm text-ink-muted whitespace-nowrap">
              {seasons.length} open
            </span>
          )}
        </div>
        <p className="text-ink-muted mt-1">{descriptor}</p>

        {/* Filters */}
        {!loading && seasons.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5">
            <FilterChips label="Format" options={formatOptions} active={activeFormat} onChange={setActiveFormat} />
            <FilterChips label="Sport" options={sportOptions} active={activeSport} onChange={setActiveSport} />
            <FilterChips label="Venue" options={venueOptions} active={activeVenue} onChange={setActiveVenue} />
          </div>
        )}

        {/* Body */}
        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-paper border border-border rounded-2xl h-[320px] animate-pulse"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : seasons.length === 0 ? (
            <div className="bg-paper border border-border rounded-2xl py-12 px-6 text-center">
              <p className="font-display text-lg text-ink">Nothing open right now.</p>
              <p className="text-ink-muted mt-1 text-sm">
                New programs are added each season — check back soon.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-paper border border-border rounded-2xl py-12 px-6 text-center">
              <p className="font-display text-lg text-ink">Nothing matches those filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.slice(0, visible).map((s) => (
                  <ProgramCardV2 key={s.id} season={s} />
                ))}
              </div>
              {visible < filtered.length && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((n) => n + PAGE_SIZE)}
                    className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary transition-colors"
                    style={{ letterSpacing: "0.08em" }}
                  >
                    Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
                    <span className="text-cream/60">({filtered.length - visible} more)</span>
                  </button>
                </div>
              )}
              {hasActiveFilters && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
