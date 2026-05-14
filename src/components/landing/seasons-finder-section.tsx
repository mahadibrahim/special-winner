"use client"

import { useEffect, useMemo, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { FilterChips, type ChipOption } from "./filter-chips"
import type { ApiSeason } from "./adult-finder"

const PAGE_SIZE = 6

/**
 * One finder section backed by the seasons catalog — used for BOTH the
 * Leagues and Tournaments sections of the /adult page. The parent passes
 * the already-audience-and-type-filtered season list; this component owns
 * the per-section chip filters, pagination, and loading/empty states.
 *
 * Filters are Sport + Venue only. A "Day"/"Month" filter was considered but
 * dropped: the only schedule signal on a season record is the free-text
 * `scheduleNotes`, and the structured `startDate` is the season-record start
 * date, not the game/event day — deriving a filter from it returns results
 * that contradict what the card displays.
 */

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
  icon: string
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
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [activeVenue, setActiveVenue] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Reset pagination whenever a filter changes — without this, narrowing
  // from a long list to a short one leaves the visitor scrolled past the
  // new first row.
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeSport, activeVenue])

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
      if (activeSport && s.sport.slug !== activeSport) return false
      if (activeVenue && s.location.slug !== activeVenue) return false
      return true
    })
  }, [seasons, activeSport, activeVenue])

  const clearFilters = () => {
    setActiveSport(null)
    setActiveVenue(null)
  }
  const hasActiveFilters = activeSport !== null || activeVenue !== null

  return (
    <section id={id} className="scroll-mt-36 py-12 lg:py-16">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl lg:text-3xl text-ink">
            <span aria-hidden="true" className="mr-2">{icon}</span>
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
