"use client"

import { useEffect, useMemo, useState } from "react"
import type { SessionCardData } from "@/components/dropin/SessionCard"
import PickupCard from "./pickup-card"
import { FilterChips, type ChipOption } from "./filter-chips"

const PAGE_SIZE = 6

/**
 * The Pickup section of the /adult finder. Backed by the drop-in sessions
 * endpoint (a rolling next-14-days window), so its results are inherently
 * time-bound — "what's on soon", not a standing catalog. Owns its own chip
 * filters (Date / Sport / Skill / Venue), pagination, and loading/empty
 * states. Renders the editorial PickupCard.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Two coarse date buckets across the ~14-day window. FilterChips auto-hides
// the row when every session falls in one bucket.
function dateBucket(startsAt: string): string {
  const days = (new Date(startsAt).getTime() - Date.now()) / MS_PER_DAY
  return days <= 7 ? "This week" : "Next week"
}

function skillLabel(skill: string): string {
  return skill.replace("_", " ")
}

function buildOptions(
  sessions: SessionCardData[],
  keyOf: (s: SessionCardData) => string | null,
  labelOf: (s: SessionCardData) => string,
): ChipOption[] {
  const acc = new Map<string, { label: string; count: number }>()
  for (const s of sessions) {
    const key = keyOf(s)
    if (!key) continue
    const existing = acc.get(key)
    if (existing) existing.count++
    else acc.set(key, { label: labelOf(s), count: 1 })
  }
  return [...acc.entries()].map(([value, { label, count }]) => ({ value, label, count }))
}

interface PickupFinderSectionProps {
  id: string
  icon: string
  title: string
  descriptor: string
  sessions: SessionCardData[]
  defaultSessionRateCents: number | null
  loading: boolean
}

export function PickupFinderSection({
  id,
  icon,
  title,
  descriptor,
  sessions,
  defaultSessionRateCents,
  loading,
}: PickupFinderSectionProps) {
  const [activeDate, setActiveDate] = useState<string | null>(null)
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const [activeVenue, setActiveVenue] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeDate, activeSport, activeSkill, activeVenue])

  const dateOptions = useMemo(
    () => buildOptions(sessions, (s) => dateBucket(s.startsAt), (s) => dateBucket(s.startsAt)),
    [sessions],
  )
  const sportOptions = useMemo(
    () => buildOptions(sessions, (s) => s.sportOrClassLabel, (s) => s.sportOrClassLabel),
    [sessions],
  )
  const skillOptions = useMemo(
    () => buildOptions(sessions, (s) => s.skillLevel, (s) => skillLabel(s.skillLevel)),
    [sessions],
  )
  const venueOptions = useMemo(
    () => buildOptions(sessions, (s) => s.venueName, (s) => s.venueName ?? ""),
    [sessions],
  )

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (activeDate && dateBucket(s.startsAt) !== activeDate) return false
      if (activeSport && s.sportOrClassLabel !== activeSport) return false
      if (activeSkill && s.skillLevel !== activeSkill) return false
      if (activeVenue && s.venueName !== activeVenue) return false
      return true
    })
  }, [sessions, activeDate, activeSport, activeSkill, activeVenue])

  const clearFilters = () => {
    setActiveDate(null)
    setActiveSport(null)
    setActiveSkill(null)
    setActiveVenue(null)
  }
  const hasActiveFilters =
    activeDate !== null || activeSport !== null || activeSkill !== null || activeVenue !== null

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
              {sessions.length} upcoming
            </span>
          )}
        </div>
        <p className="text-ink-muted mt-1">{descriptor}</p>

        {/* Filters */}
        {!loading && sessions.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5">
            <FilterChips label="Date" options={dateOptions} active={activeDate} onChange={setActiveDate} />
            <FilterChips label="Sport" options={sportOptions} active={activeSport} onChange={setActiveSport} />
            <FilterChips label="Skill" options={skillOptions} active={activeSkill} onChange={setActiveSkill} />
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
                  className="bg-paper border border-border rounded-2xl h-[280px] animate-pulse"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-paper border border-border rounded-2xl py-12 px-6 text-center">
              <p className="font-display text-lg text-ink">No pickup sessions scheduled.</p>
              <p className="text-ink-muted mt-1 text-sm">
                Pickup runs on a rolling two-week schedule — check back soon.
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
                  <PickupCard
                    key={s.id}
                    session={s}
                    defaultSessionRateCents={defaultSessionRateCents}
                  />
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
