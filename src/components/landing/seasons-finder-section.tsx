"use client"

import { useEffect, useMemo, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { ProgramCardSkeleton } from "@/components/programs/program-card-skeleton"
import { CardGrid } from "@/components/programs/card-grid"
import { FilterChips, type ChipOption } from "./filter-chips"
import { EmptyNotifyForm } from "./empty-notify-form"
import { YouthDivisionTable } from "./youth-division-table"
import type { ApiSeason } from "@/lib/programs/api-season"
import { deriveDayKey, DAY_KEYS, DAY_LABELS } from "@/lib/programs/derive"
import { useFinderFilter } from "@/lib/hooks/use-finder-filter"
import { divisionRowModel } from "@/lib/leagues/division-row-model"

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
 * The Day chips key on the structured `dayOfWeek` column (falling back to the
 * start date's weekday), Mon→Sun order, rendered only for days present in the
 * section's inventory — same chip language as Format/Sport/Venue.
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
  /**
   * When set, the "nothing open" empty state includes an email-capture form
   * (newsletter audience segment). Pass it on ONE section per page — the
   * first — so a fully-empty catalog leads with a working next step instead
   * of a dead end, without repeating the form in every empty section.
   */
  emptyCtaAudience?: "parent" | "adult"
  /** Visually hide the h2/descriptor/count (kept for screen readers). For
   *  embeds where the enclosing band already carries the heading — e.g. the
   *  classes page's "Book it right here." red band, where a second visible
   *  heading would straddle the band boundary. Default: visible. */
  headerHidden?: boolean
  /** Opt-in only — forwarded to ProgramCardV2. Omitted renders the default
   *  card, byte-identical to every existing consumer. */
  cardVariant?: "default" | "youth-band"
  /** Opt-in only — "table" renders the direct-booking division table
   *  (YouthDivisionTable) instead of the card grid. Omitted (or "cards")
   *  renders byte-identical to every existing consumer. */
  layout?: "cards" | "table"
  /** Opt-in only — shows an All/Competitive/Developmental chip row above the
   *  existing filter chips. Default false renders byte-identical to every
   *  existing consumer. */
  levelChips?: boolean
}

export function SeasonsFinderSection({
  id,
  icon,
  title,
  descriptor,
  seasons,
  loading,
  emptyCtaAudience,
  cardVariant,
  headerHidden = false,
  layout = "cards",
  levelChips = false,
}: SeasonsFinderSectionProps) {
  const [activeFormat, setActiveFormat] = useState<string | null>(null)
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [activeVenue, setActiveVenue] = useState<string | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [level, setLevel] = useState<"all" | "competitive" | "developmental">("all")
  const [visible, setVisible] = useState(PAGE_SIZE)

  // A hero tile elsewhere on the page can pre-apply this section's Sport
  // filter. The section's Sport chips key on `sport.slug`, and category-page
  // tiles carry the matching slug, so we set activeSport directly.
  useFinderFilter((detail) => {
    if (detail.sectionId === id) setActiveSport(detail.key)
  })

  // Reset pagination whenever a filter changes — without this, narrowing
  // from a long list to a short one leaves the visitor scrolled past the
  // new first row.
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [activeFormat, activeSport, activeVenue, activeDay])

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
  // Day chips in fixed Mon..Sun order (buildOptions would order by first
  // appearance); only days with inventory render.
  const dayOptions = useMemo(
    () =>
      DAY_KEYS.map((d) => ({
        value: d as string,
        label: DAY_LABELS[d],
        count: seasons.filter((s) => deriveDayKey(s) === d).length,
      })).filter((o) => o.count > 0),
    [seasons],
  )

  const filtered = useMemo(() => {
    return seasons.filter((s) => {
      if (activeFormat && s.program.programType !== activeFormat) return false
      if (activeSport && s.sport.slug !== activeSport) return false
      if (activeVenue && s.location.slug !== activeVenue) return false
      if (activeDay && deriveDayKey(s) !== activeDay) return false
      return true
    })
  }, [seasons, activeFormat, activeSport, activeVenue, activeDay])

  // Table-layout only — pure display rows derived from `filtered`, so the
  // event-driven age filter (applied upstream, into the `seasons` prop
  // itself) still narrows table rows exactly like it narrows cards.
  const rows = useMemo(
    () =>
      filtered.map((s) =>
        divisionRowModel(s as unknown as Parameters<typeof divisionRowModel>[0]),
      ),
    [filtered],
  )
  const levelRows = useMemo(
    () => (level === "all" ? rows : rows.filter((r) => r.kind === level)),
    [rows, level],
  )
  const levelOptions = useMemo(() => {
    const counts = { competitive: 0, developmental: 0 }
    for (const r of rows) counts[r.kind]++
    return [
      { value: "competitive", label: "Competitive (team entry)", count: counts.competitive },
      { value: "developmental", label: "Developmental (per kid)", count: counts.developmental },
    ].filter((o) => o.count > 0)
  }, [rows])

  // Another filter (day/venue/sport/…) can narrow `filtered` down to only
  // the OTHER kind, dropping the active level's count to zero — its chip
  // then disappears from levelOptions while `level` itself is still set,
  // which would otherwise leave the table stuck on zero rows. Fall back to
  // "all" the moment that happens. No-op for every existing consumer:
  // `level` never leaves "all" when `levelChips` is false (the chip that
  // would change it never renders).
  useEffect(() => {
    if (level === "all") return
    if (!levelOptions.some((o) => o.value === level)) setLevel("all")
  }, [level, levelOptions])

  const clearFilters = () => {
    setActiveFormat(null)
    setActiveSport(null)
    setActiveVenue(null)
    setLevel("all")
    setActiveDay(null)
  }
  const hasActiveFilters =
    activeFormat !== null || activeSport !== null || activeVenue !== null || activeDay !== null

  // Header count states what is registerable NOW — forming seasons render
  // (with their interest form) but do not count as "open".
  const openCount = seasons.filter((s) => s.status !== "forming").length

  return (
    <section id={id} className={headerHidden ? "scroll-mt-36 pt-8 pb-10" : "scroll-mt-36 py-12 lg:py-16"}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading (sr-only when the enclosing band already carries one) */}
        <div className={headerHidden ? "sr-only" : undefined}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl lg:text-3xl text-ink">
              {icon && <span aria-hidden="true" className="mr-2">{icon}</span>}
              {title}
            </h2>
            {!loading && (
              <span className="text-sm text-ink-muted whitespace-nowrap">
                {openCount} open
              </span>
            )}
          </div>
          <p className="text-ink-muted mt-1">{descriptor}</p>
        </div>

        {/* Level chips — opt-in, sits above the existing filter chips. */}
        {levelChips && !loading && seasons.length > 0 && (
          <div className="mt-6">
            <FilterChips
              label="Level"
              options={levelOptions}
              active={level === "all" ? null : level}
              onChange={(v) => setLevel((v as "competitive" | "developmental") ?? "all")}
            />
          </div>
        )}

        {/* Filters */}
        {!loading && seasons.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5">
            <FilterChips label="Format" options={formatOptions} active={activeFormat} onChange={setActiveFormat} />
            <FilterChips label="Sport" options={sportOptions} active={activeSport} onChange={setActiveSport} />
            <FilterChips label="Venue" options={venueOptions} active={activeVenue} onChange={setActiveVenue} />
            <FilterChips label="Day" options={dayOptions} active={activeDay} onChange={setActiveDay} />
          </div>
        )}

        {/* Body */}
        <div className="mt-8">
          {loading ? (
            <CardGrid layout="grid">
              {[0, 1, 2].map((i) => (
                <ProgramCardSkeleton key={i} />
              ))}
            </CardGrid>
          ) : seasons.length === 0 ? (
            // data-finder-empty: hero tiles with a fallback href check this
            // marker to decide between scroll-filtering and navigating away
            // (see category-hero.astro's click handler).
            cardVariant === "youth-band" ? (
              // Youth-band empty state — styled like the booking cards it
              // stands in for (colored band header + paper body) so an empty
              // catalog still looks designed, not broken. Copy is generic to
              // any youth offering (blocks AND seasons) — never invents
              // inventory.
              <div data-finder-empty className="max-w-[560px] mx-auto rounded-2xl overflow-hidden border border-cream-3 bg-paper text-center shadow-xl">
                <div className="bg-emerald text-cream py-2.5 px-5 font-mono text-[10px] tracking-widest uppercase">
                  Get notified first
                </div>
                <div className="py-10 px-6">
                  <p className="font-display font-semibold text-2xl text-ink">
                    Be first in when it opens.
                  </p>
                  <p className="text-ink-muted mt-2 text-sm max-w-[400px] mx-auto">
                    {emptyCtaAudience
                      ? "New blocks and seasons open through the year — leave your email and you'll hear the moment the next one does."
                      : "New blocks and seasons open through the year — check back soon."}
                  </p>
                  {emptyCtaAudience && (
                    <EmptyNotifyForm
                      audience={emptyCtaAudience}
                      source={`empty-finder-${id}`}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div data-finder-empty className="bg-paper border border-border rounded-2xl py-12 px-6 text-center">
                <p className="font-display text-lg text-ink">Nothing open right now.</p>
                <p className="text-ink-muted mt-1 text-sm">
                  {emptyCtaAudience
                    ? "New programs are added each season — leave your email and you'll hear the moment one opens."
                    : "New programs are added each season — check back soon."}
                </p>
                {emptyCtaAudience && (
                  <EmptyNotifyForm
                    audience={emptyCtaAudience}
                    source={`empty-finder-${id}`}
                  />
                )}
              </div>
            )
          ) : filtered.length === 0 || (layout === "table" && levelRows.length === 0) ? (
            // Reuses the same "nothing matches" messaging for the table's
            // level-narrowed-to-zero case (transient — the effect above
            // resets `level` to "all" right after this renders — but the
            // render still needs to show something other than a bare table
            // header in the meantime).
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
              {layout === "table" ? (
                // Table layout — opt-in, direct-booking division rows. Cards
                // branch (the else-below) stays untouched.
                <YouthDivisionTable rows={levelRows} />
              ) : (
                <>
                  <CardGrid layout="grid">
                    {filtered.slice(0, visible).map((s, i) => (
                      <ProgramCardV2 key={s.id} season={s} cardVariant={cardVariant} index={i} />
                    ))}
                  </CardGrid>
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
                </>
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
