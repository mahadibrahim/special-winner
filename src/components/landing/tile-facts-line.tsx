"use client"

import { useEffect, useState } from "react"
import { fetchPublicCatalogSeasons } from "@/lib/programs/public-seasons-client"
import {
  openScopedSeasons,
  minIndividualPrice,
  earliestRegistrationCloses,
  primaryTermLabel,
  ageRangeAcross,
} from "@/lib/programs/season-facts"
import type { CategoryAudience } from "@/lib/programs/category-pages"

/**
 * One small mono facts line for a hub door tile ("Fall · 7 games · $120 solo
 * · closes Sep 3"). Live facts (term, price, deadline, youth ages) are
 * computed client-side from the OPEN seasons in the shared public-catalog
 * fetch — the hub pages are edge-cached marketing HTML
 * (setMarketingEdgeCache), so a server-side fetch would freeze stale facts
 * into the CDN copy. One authored fragment per tile carries copy the data
 * can't (the adult "7 games" format). Facts lacking data are omitted, never
 * invented; with no data at all the reserved line stays blank (no layout
 * shift, tile otherwise unchanged).
 *
 * Renders inside CategoryCard's aurora-gradient door: cream text over the
 * card's bottom darkening overlay, matching the tile's mono status label.
 */

interface TileFactsLineProps {
  audience: CategoryAudience
  /** Scope facts are computed over — leagues only on both hubs, so a cheap
   *  clinic never becomes the tile's headline price. */
  programTypes?: string[]
  /** Authored fragment injected after the term, e.g. "7 games" — mirrors the
   *  category page's authored facts-band fact. */
  authoredFact?: string
}

function joinFacts(parts: Array<string | null>): string | null {
  const kept = parts.filter((p): p is string => p != null && p.length > 0)
  return kept.length > 0 ? kept.join(" · ") : null
}

export default function TileFactsLine({
  audience,
  programTypes = ["league"],
  authoredFact,
}: TileFactsLineProps) {
  const [seasons, setSeasons] = useState<Awaited<
    ReturnType<typeof fetchPublicCatalogSeasons>
  > | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicCatalogSeasons()
      .then((all) => {
        if (!cancelled) setSeasons(all)
      })
      .catch(() => {
        // Degrade to a blank line — never block the tile.
        if (!cancelled) setSeasons([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const open = openScopedSeasons(seasons ?? [], audience, programTypes)

  // Term: compact on a tile — "Fall 2026" reads as "Fall"; a non-year term
  // like "Winter I" renders as-is.
  const term = primaryTermLabel(open)?.replace(/\s+\d{4}$/, "") ?? null
  const price = minIndividualPrice(open)
  const closes = earliestRegistrationCloses(open)
  const ages = audience === "youth" ? ageRangeAcross(open) : null

  const line = joinFacts([
    term,
    authoredFact ?? null,
    ages != null ? `ages ${ages.min}–${ages.max}` : null,
    price != null
      ? audience === "youth"
        ? `from $${price.toLocaleString()}`
        : `$${price.toLocaleString()} solo`
      : null,
    closes != null
      ? `closes ${closes.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
      : null,
  ])

  // Height is always reserved so the line popping in after hydration never
  // shifts the tile's CTA row.
  return (
    <span className="block min-h-[15px] mt-2.5 font-mono text-[10.5px] tracking-[0.04em] leading-snug text-cream opacity-95">
      {line ?? " "}
    </span>
  )
}
