"use client"

import { useEffect, useMemo, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import {
  AGE_BAND_CHIPS,
  byRegistrationCloses,
  inAgeBand,
  matchesAgeGroup,
  scopeSeasons,
  type CategoryAudience,
} from "@/lib/programs/category-pages"
import { SeasonsFinderSection } from "./seasons-finder-section"
import { FilterChips, type ChipOption } from "./filter-chips"
import type { ApiSeason } from "@/lib/programs/api-season"
import { fetchPublicCatalogSeasons } from "@/lib/programs/public-seasons-client"
import { onFinderFilter } from "@/lib/landing/finder-filter"

/**
 * The island behind an audience-scoped category page (/adult/leagues,
 * /youth/camps, …). Fetches the public catalog once (open + forming, same
 * inventory as /programs), scopes it to
 * this page's audience + program types, sorts soonest-deadline-first, and
 * renders the existing SeasonsFinderSection (which owns the Format/Sport/
 * Venue chips, pagination, and the empty states — including the
 * email-capture form via emptyCtaAudience when the whole catalog is empty).
 * Youth pages add an Age chip row above the section — on category pages age
 * is a filter, not a page axis.
 */

interface CategoryFinderProps {
  audience: CategoryAudience
  programTypes: string[]
  /** Section heading, e.g. "Open now". */
  title: string
  descriptor: string
  /** Show the Age chip row (youth pages). */
  ageChips?: boolean
  /** Section anchor id, e.g. "adult-leagues". Also drives the empty-state
   *  signup attribution: newsletter source = "empty-finder-<sectionId>". */
  sectionId: string
}

export default function CategoryFinder({
  audience,
  programTypes,
  title,
  descriptor,
  ageChips = false,
  sectionId,
}: CategoryFinderProps) {
  useHydrationBeacon()

  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [activeBand, setActiveBand] = useState<string | null>(null)
  const [activeAgeGroup, setActiveAgeGroup] = useState<string | null>(null)

  useEffect(() => {
    return onFinderFilter((detail) => {
      if (detail.sectionId !== sectionId) return
      setActiveAgeGroup(detail.ageGroup ?? null)
    })
  }, [sectionId])

  useEffect(() => {
    let cancelled = false
    // Fetch the full public set (default returns open/active/forming) and keep
    // the advertisable ones — open (register) and forming (interest list) —
    // mirroring programs-catalog.tsx, so category finders show the same
    // inventory as the catalog. Forming cards render their interest form.
    // The fetch is memoized module-wide so the facts band / calendar band on
    // the same page share this one request.
    fetchPublicCatalogSeasons()
      .then((all) => {
        if (!cancelled)
          setSeasons(all.filter((s) => s.status === "open" || s.status === "forming"))
      })
      .catch(() => {
        // Silent — the section renders its own empty state.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scoped = useMemo(
    // scopeSeasons returns a fresh array (.filter), so in-place sort is safe.
    () => scopeSeasons(seasons, audience, programTypes).sort(byRegistrationCloses),
    [seasons, audience, programTypes],
  )

  const bandOptions: ChipOption[] = useMemo(
    () =>
      !ageChips
        ? []
        : AGE_BAND_CHIPS.map((b) => ({
            value: b.value,
            label: b.label,
            count: scoped.filter((s) => inAgeBand(s, b.min, b.max)).length,
          })).filter((o) => o.count > 0),
    [scoped, ageChips],
  )

  const visible = useMemo(() => {
    let result = scoped
    if (ageChips && activeBand) {
      const band = AGE_BAND_CHIPS.find((b) => b.value === activeBand)
      if (band) result = result.filter((s) => inAgeBand(s, band.min, band.max))
    }
    return result.filter((s) => matchesAgeGroup(s, activeAgeGroup))
  }, [scoped, ageChips, activeBand, activeAgeGroup])

  return (
    <div>
      {ageChips && !loading && bandOptions.length > 1 && (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 -mb-4">
          <FilterChips label="Age" options={bandOptions} active={activeBand} onChange={setActiveBand} />
        </div>
      )}
      <SeasonsFinderSection
        key={activeBand ?? "all"}
        id={sectionId}
        title={title}
        descriptor={descriptor}
        seasons={visible}
        loading={loading}
        emptyCtaAudience={audience === "youth" ? "parent" : "adult"}
      />
    </div>
  )
}
