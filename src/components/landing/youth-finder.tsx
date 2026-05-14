"use client"

import { useEffect, useState } from "react"
import { deriveAudience } from "@/lib/programs/derive"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { SectionNav, type SectionNavItem } from "./section-nav"
import { SeasonsFinderSection } from "./seasons-finder-section"
import type { ApiSeason } from "./adult-finder"

/**
 * The /youth finder — the interactive heart of the youth landing page. One
 * island that:
 *   • fetches the seasons catalog once,
 *   • filters to youth-audience seasons and splits them into three age
 *     bands (4–8 / 9–12 / 13–18),
 *   • renders the sticky section-nav + the three stacked age sections,
 *   • runs a scroll-spy so the nav highlights the band in view.
 *
 * Age-led, not format-led: parents shop by their kid's age first, so the
 * sections ARE the age bands and program format is a filter chip inside
 * each (handled by SeasonsFinderSection's Format chip).
 *
 * Everything a parent needs resolves on this page without navigating away.
 */

interface AgeBand {
  id: string
  title: string
  descriptor: string
  min: number
  max: number
}

const AGE_BANDS: AgeBand[] = [
  {
    id: "ages-4-8",
    title: "Ages 4–8",
    descriptor: "First touch and fundamentals — where a love of the game starts.",
    min: 4,
    max: 8,
  },
  {
    id: "ages-9-12",
    title: "Ages 9–12",
    descriptor: "Skill building — where the game starts to click.",
    min: 9,
    max: 12,
  },
  {
    id: "ages-13-18",
    title: "Ages 13–18",
    descriptor: "Competitive play for older kids and teens.",
    min: 13,
    max: 18,
  },
]

const NAV_ITEMS: SectionNavItem[] = AGE_BANDS.map((b) => ({ id: b.id, label: b.title }))

/** A season belongs to a band if its age range overlaps the band's range.
 *  A season with no age group applies to any age, so it appears in all
 *  bands — never hidden. */
function inBand(s: ApiSeason, min: number, max: number): boolean {
  if (!s.ageGroup) return true
  return s.ageGroup.minAge <= max && s.ageGroup.maxAge >= min
}

export default function YouthFinder() {
  useHydrationBeacon()

  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>(AGE_BANDS[0].id)

  // Seasons fetch — one request feeds all three age sections.
  useEffect(() => {
    let cancelled = false
    fetch("/api/public/seasons?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { seasons: ApiSeason[] }) => {
        if (!cancelled) setSeasons(j.seasons)
      })
      .catch(() => {
        // Silent — sections render their own empty state.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Scroll-spy — highlight whichever age section is crossing the
  // upper-middle of the viewport. The <section id> wrappers always render
  // (even while loading), so they're queryable right after mount.
  useEffect(() => {
    const els = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const youthSeasons = seasons.filter((s) => deriveAudience(s) === "youth")

  return (
    // Wrapping div is the sticky containing block for SectionNav — it keeps
    // the nav pinned across the three age sections, then releases it once
    // the visitor scrolls past Ages 13–18 into WhyAspire / FAQ / the CTA.
    <div>
      <SectionNav items={NAV_ITEMS} active={activeSection} />

      {AGE_BANDS.map((band) => (
        <SeasonsFinderSection
          key={band.id}
          id={band.id}
          title={band.title}
          descriptor={band.descriptor}
          seasons={youthSeasons.filter((s) => inBand(s, band.min, band.max))}
          loading={loading}
        />
      ))}
    </div>
  )
}
