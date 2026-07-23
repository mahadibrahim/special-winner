"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronRight, SlidersHorizontal } from "lucide-react"
import ProgramCardV2 from "./program-card-v2"
import { CardGrid, CardGridItem } from "./card-grid"
import { deriveAudience, deriveDayKey, DAY_KEYS, DAY_LABELS, type SeasonForDerive } from "@/lib/programs/derive"

type Audience = "youth" | "adult" | "team"

interface ApiSeason {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  teamPrice: number | null
  earlyBirdPrice: number | null
  earlyBirdTeamPrice: number | null
  earlyBirdDeadline: string | null
  signupModes: string[]
  deposit: number | null
  allowDeposit: boolean
  pricingMode: string
  maxParticipants: number | null
  registeredCount: number
  spotsLeft: number | null
  scheduleNotes: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  status: string
  registrationCloses?: string | null
  program: { id: string; name: string; slug: string; programType: string; audienceType: string }
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
  minAge: number | null
  maxAge: number | null
}

interface Props {
  initialAudience?: Audience | null
  initialType?: string | null
  initialAgeBand?: string | null
}

const SEGMENT_LABELS: Record<Audience, { icon: string; label: string; sub: string }> = {
  youth: { icon: "👶", label: "A kid", sub: "Youth · ages 4–18" },
  adult: { icon: "⚽", label: "Myself", sub: "Adult leagues · solo or w/ team" },
  team: { icon: "🏆", label: "A team", sub: "Captain registration" },
}

export default function ProgramsCatalog({ initialAudience, initialType, initialAgeBand }: Props) {
  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [audience, setAudience] = useState<Audience>(
    initialAudience === "adult" ? "adult"
    : initialAudience === "team" ? "team"
    : "youth",
  )
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [activeLocation, setActiveLocation] = useState<string | null>(null)
  const [activeAgeBand, setActiveAgeBand] = useState<string | null>(initialAgeBand ?? null)
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(initialType ?? null)
  const [sort, setSort] = useState<"start" | "deadline" | "filling">("start")
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  // Pagination — full catalog. Initial page size of 12 (3 grid rows on
  // desktop, 12 stacked on mobile = ~6 viewports of scroll). "Show more"
  // adds another PAGE_SIZE chunk per click.
  const [visibleCount, setVisibleCount] = useState(12)

  // Sync URL ?audience= → state
  useEffect(() => {
    if (initialAudience === "adult") setAudience("adult")
    else if (initialAudience === "team") setAudience("team")
  }, [initialAudience])

  // Reset pagination whenever the user changes audience or any filter chip.
  // Without this, switching from "Youth" (66 results) to "Adult" (151) keeps
  // the visibleCount and feels broken when the user doesn't see the new
  // first row.
  useEffect(() => {
    setVisibleCount(12)
  }, [audience, activeSport, activeLocation, activeAgeBand, activeSkill, activeDay, activeType, sort])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // Fetch the full public set (default returns open/active/forming) and keep
    // the advertisable ones: `open` (register) and `forming` (interest list).
    // program-card-v2 renders the right CTA per `signupMode`. We drop `active`
    // (in-season) so the catalog stays a "join now / coming soon" surface.
    fetch("/api/public/seasons")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load programs")
        return r.json() as Promise<{ seasons: ApiSeason[] }>
      })
      .then((j) => {
        if (cancelled) return
        setSeasons(
          j.seasons.filter((s) => s.status === "open" || s.status === "forming"),
        )
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Step 1: filter by audience segment. Team segment includes both
  // team-only and dual-mode adult leagues (anything that accepts a team).
  const segmentSeasons = useMemo(() => {
    if (audience === "team") {
      return seasons.filter(
        (s) =>
          deriveAudience(s as SeasonForDerive) === "adult" &&
          (s.signupModes ?? []).includes("team"),
      )
    }
    return seasons.filter((s) => deriveAudience(s as SeasonForDerive) === audience)
  }, [seasons, audience])

  // Step 2: derive facet inventories from the segment slice.
  const sports = useMemo(() => unique(segmentSeasons.map((s) => s.sport.slug)), [segmentSeasons])
  const locations = useMemo(() => unique(segmentSeasons.map((s) => s.location.slug)), [segmentSeasons])
  // Per-day chip inventory, Mon..Sun order — a chip renders only for days
  // with at least one season in the current audience scope. Counts come from
  // the segment slice, matching how the Sport/Location chips compute theirs.
  const dayOptions = useMemo(
    () =>
      DAY_KEYS.map((d) => ({
        value: d as string,
        label: DAY_LABELS[d],
        count: segmentSeasons.filter((s) => deriveDayKey(s as SeasonForDerive) === d).length,
      })).filter((o) => o.count > 0),
    [segmentSeasons],
  )

  // Age bands (youth only) — coarse buckets for chip strip.
  const ageBands = useMemo(() => {
    if (audience !== "youth") return []
    const bands = [
      {
        key: "4-8",
        label: "Ages 4–8",
        match: (s: ApiSeason) => {
          // Prefer ageGroup bounds; fall back to season's own minAge/maxAge.
          const hi = s.ageGroup?.maxAge ?? s.maxAge
          const lo = s.ageGroup?.minAge ?? s.minAge
          return hi != null && hi <= 8 && (lo == null || lo <= 8)
        },
      },
      {
        key: "9-12",
        label: "Ages 9–12",
        match: (s: ApiSeason) => {
          const lo = s.ageGroup?.minAge ?? s.minAge
          const hi = s.ageGroup?.maxAge ?? s.maxAge
          return lo != null && lo >= 9 && hi != null && hi <= 12
        },
      },
      {
        key: "13-18",
        label: "Ages 13–18",
        match: (s: ApiSeason) => {
          const lo = s.ageGroup?.minAge ?? s.minAge
          return lo != null && lo >= 13
        },
      },
    ]
    return bands.map((b) => ({ ...b, count: segmentSeasons.filter(b.match).length })).filter((b) => b.count > 0)
  }, [segmentSeasons, audience])

  // Step 3: apply chip filters.
  const filtered = useMemo(() => {
    return segmentSeasons.filter((s) => {
      if (activeSport && s.sport.slug !== activeSport) return false
      if (activeLocation && s.location.slug !== activeLocation) return false
      if (activeDay && deriveDayKey(s as SeasonForDerive) !== activeDay) return false
      if (audience === "youth" && activeAgeBand) {
        const band = ageBands.find((b) => b.key === activeAgeBand)
        if (band && !band.match(s)) return false
      }
      if (activeType && s.program.programType !== activeType) return false
      // Skill filtering is not yet derivable from the schema; placeholder.
      // NOTE: activeType from the ?type= query param also filters programType —
      // reconcile with this when wiring activeSkill so they don't double-filter.
      if (activeSkill) {
        // TODO: when seasons have a skill_level field, filter by it here
      }
      return true
    })
  }, [segmentSeasons, activeSport, activeLocation, activeAgeBand, activeSkill, activeDay, activeType, audience, ageBands])

  // Step 4: sort.
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sort === "start") return a.startDate.localeCompare(b.startDate)
      if (sort === "deadline") {
        const ad = a.registrationCloses ?? a.startDate
        const bd = b.registrationCloses ?? b.startDate
        return ad.localeCompare(bd)
      }
      if (sort === "filling") {
        const af = a.maxParticipants ? a.registeredCount / a.maxParticipants : 0
        const bf = b.maxParticipants ? b.registeredCount / b.maxParticipants : 0
        return bf - af
      }
      return 0
    })
    return arr
  }, [filtered, sort])

  // Featured rows are tailored to the segment.
  const featuredRows = useMemo(() => {
    const rows: Array<{ title: string; items: ApiSeason[] }> = []
    if (filtered.length === 0) return rows

    const fillingUp = filtered
      .filter((s) => s.maxParticipants && s.registeredCount / s.maxParticipants >= 0.6)
      .slice(0, 8)
    if (fillingUp.length > 0) rows.push({ title: "Filling up", items: fillingUp })

    const startingSoon = [...filtered]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8)
    if (startingSoon.length > 0) rows.push({ title: "Starting soon", items: startingSoon })

    if (audience === "youth") {
      const popularMid = filtered
        .filter((s) => s.ageGroup && s.ageGroup.minAge >= 9 && s.ageGroup.maxAge <= 12)
        .slice(0, 8)
      if (popularMid.length > 0) rows.push({ title: "Most popular ages 9–12", items: popularMid })
    }
    return rows
  }, [filtered, audience])

  if (loading) {
    return (
      <div className="py-20 text-center text-ink-muted">
        <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3"></div>
        <p>Loading programs…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-2">{error}</p>
      </div>
    )
  }

  if (seasons.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <h2 className="font-display text-2xl text-ink mb-3">No programs open right now.</h2>
        <p className="text-ink-muted mb-6">
          Programs are added as seasons are scheduled. Check back soon, or join the
          newsletter (footer) to hear about new openings first.
        </p>
      </div>
    )
  }

  return (
    <div>
      {activeType && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={() => setActiveType(null)}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide bg-ink text-cream px-3 py-1.5 rounded-full"
          >
            Showing: {activeType.charAt(0).toUpperCase() + activeType.slice(1)}
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Clear program type filter</span>
          </button>
        </div>
      )}

      {/* Step 1: Audience segmenter */}
      <div className="mb-8 max-w-3xl mx-auto">
        <p className="text-center text-sm text-ink-muted mb-4 font-medium tracking-wide uppercase">
          Who's signing up?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(SEGMENT_LABELS) as Audience[]).map((seg) => {
            const meta = SEGMENT_LABELS[seg]
            const count =
              seg === "team"
                ? seasons.filter(
                    (s) =>
                      deriveAudience(s as SeasonForDerive) === "adult" &&
                      (s.signupModes ?? []).includes("team"),
                  ).length
                : seasons.filter((s) => deriveAudience(s as SeasonForDerive) === seg).length
            const active = audience === seg
            return (
              <button
                key={seg}
                type="button"
                onClick={() => {
                  setAudience(seg)
                  setActiveAgeBand(null)
                  setActiveSkill(null)
                }}
                className={`group flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                  active
                    ? "border-ink bg-ink text-cream"
                    : "border-border bg-paper hover:border-primary/50"
                }`}
              >
                <span className="text-2xl">{meta.icon}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{meta.label}</div>
                  <div className={`text-xs mt-0.5 ${active ? "text-cream/70" : "text-ink-muted"}`}>
                    {meta.sub} · {count}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Step 2: Context-aware chip strip (sticky on scroll) */}
      <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-cream/95 backdrop-blur border-y border-border py-3 mb-8">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mobile: collapse into one button */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="md:hidden inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide bg-paper border border-border rounded-md px-3 py-2"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filter
          </button>

          {/* Desktop: chips inline. Mobile: collapsible. */}
          <div className={`${mobileFiltersOpen ? "flex" : "hidden"} md:flex flex-wrap items-center gap-2 flex-1`}>
            {/* Sport — auto-hidden when only one option */}
            {sports.length > 1 && (
              <ChipGroup
                label="Sport"
                options={sports.map((slug) => {
                  const sport = segmentSeasons.find((s) => s.sport.slug === slug)?.sport
                  return { value: slug, label: sport?.name ?? slug, count: segmentSeasons.filter((s) => s.sport.slug === slug).length }
                })}
                active={activeSport}
                onChange={setActiveSport}
              />
            )}

            {/* Audience-specific second facet */}
            {audience === "youth" && ageBands.length > 1 && (
              <ChipGroup
                label="Age"
                options={ageBands.map((b) => ({ value: b.key, label: b.label, count: b.count }))}
                active={activeAgeBand}
                onChange={setActiveAgeBand}
              />
            )}
            {audience === "team" && (
              <ChipGroup
                label="Format"
                options={unique(segmentSeasons.map((s) => s.program.programType)).map((t) => ({
                  value: t,
                  label: t.charAt(0).toUpperCase() + t.slice(1),
                  count: segmentSeasons.filter((s) => s.program.programType === t).length,
                }))}
                active={activeSkill}
                onChange={setActiveSkill}
              />
            )}

            {/* Location — auto-hidden when only one option */}
            {locations.length > 1 && (
              <ChipGroup
                label="Location"
                options={locations.map((slug) => {
                  const loc = segmentSeasons.find((s) => s.location.slug === slug)?.location
                  return {
                    value: slug,
                    label: (loc?.name ?? slug).replace(/^Soccer One\s+/i, ""),
                    count: segmentSeasons.filter((s) => s.location.slug === slug).length,
                  }
                })}
                active={activeLocation}
                onChange={setActiveLocation}
              />
            )}

            {/* Day — per-day chips (Mon..Sun), auto-hidden when only one option */}
            {dayOptions.length > 1 && (
              <ChipGroup
                label="Day"
                options={dayOptions}
                active={activeDay}
                onChange={setActiveDay}
              />
            )}

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="ml-auto bg-paper border border-border rounded-md px-2.5 py-1.5 text-xs text-ink-2"
              aria-label="Sort"
            >
              <option value="start">Sort: Start date ↓</option>
              <option value="deadline">Sort: Deadline ↑</option>
              <option value="filling">Sort: Filling fastest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Step 3: Featured rows */}
      {featuredRows.map((row) => (
        <section key={row.title} className="mb-10">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-display text-xl text-ink">{row.title}</h2>
            <span className="text-xs text-ink-muted">{row.items.length} program{row.items.length === 1 ? "" : "s"}</span>
          </div>
          <CardGrid layout="scroll-row">
            {row.items.map((s) => (
              <CardGridItem key={`${row.title}-${s.id}`}>
                <ProgramCardV2 season={s} emphasis={audience === "team" ? "team" : undefined} />
              </CardGridItem>
            ))}
          </CardGrid>
        </section>
      ))}

      {/* Step 4: Full filtered catalog (paginated). */}
      <section className="border-t border-border pt-10 mt-4">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-2xl text-ink">
            {audience === "youth" ? "All youth programs" : audience === "adult" ? "All adult leagues" : "All team-only leagues"}
          </h2>
          <span className="text-xs text-ink-muted">
            {sorted.length === 0
              ? "0 programs"
              : `Showing ${Math.min(visibleCount, sorted.length)} of ${sorted.length}`}
          </span>
        </div>
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-ink-muted">
            <p>Nothing matches your filters. Try removing one.</p>
            <button
              type="button"
              onClick={() => {
                setActiveSport(null)
                setActiveLocation(null)
                setActiveAgeBand(null)
                setActiveSkill(null)
                setActiveDay(null)
              }}
              className="mt-3 text-sm font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <CardGrid layout="grid">
              {sorted.slice(0, visibleCount).map((s) => (
                <ProgramCardV2 key={s.id} season={s} emphasis={audience === "team" ? "team" : undefined} />
              ))}
            </CardGrid>
            {visibleCount < sorted.length && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => Math.min(n + 12, sorted.length))}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary transition-colors w-full sm:w-auto"
                  style={{ letterSpacing: "0.08em" }}
                >
                  Show {Math.min(12, sorted.length - visibleCount)} more
                  <span className="text-cream/60 ml-1">
                    ({sorted.length - visibleCount} remaining)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function ChipGroup({
  label,
  options,
  active,
  onChange,
}: {
  label: string
  options: Array<{ value: string; label: string; count: number }>
  active: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tracking-[0.1em] uppercase text-ink-muted font-semibold mr-1">
        {label}:
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
          active === null ? "bg-ink text-cream border-ink" : "bg-paper text-ink-2 border-border hover:border-ink-muted"
        }`}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(active === opt.value ? null : opt.value)}
          className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
            active === opt.value ? "bg-ink text-cream border-ink" : "bg-paper text-ink-2 border-border hover:border-ink-muted"
          }`}
        >
          {opt.label} <span className="opacity-60 ml-0.5">{opt.count}</span>
        </button>
      ))}
      <span className="hidden md:inline-block w-px h-5 bg-border mx-1.5" />
    </div>
  )
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}
