"use client"

import { useEffect, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { ProgramCardSkeleton } from "@/components/programs/program-card-skeleton"
import { CardGrid } from "@/components/programs/card-grid"
import { deriveAudience } from "@/lib/programs/derive"
import { byRegistrationCloses } from "@/lib/programs/category-pages"
import { fetchPublicCatalogSeasons } from "@/lib/programs/public-seasons-client"
import {
  openScopedSeasons,
  minIndividualPrice,
  minTeamTotal,
  minHoldDeposit,
  earliestRegistrationCloses,
  primaryTermLabel,
  ageRangeAcross,
} from "@/lib/programs/season-facts"
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"
import { EmptyNotifyForm } from "@/components/landing/empty-notify-form"
import type { ApiSeason } from "@/lib/programs/api-season"

/**
 * Homepage "Pick your season." — two audience rows under one section header.
 *
 * Row 1 "For adults": up to 3 open/forming adult LEAGUE cards plus a computed
 * facts line ("Fall 2026 · $120 solo / $200 reserves a team · closes Sep 3").
 * Row 2 "For kids": up to 3 open/forming youth cards (any program type;
 * forming cards render their interest form exactly as in the catalog) plus a
 * computed facts line ("Winter I · ages 4–12 · $50 holds a spot · closes
 * Oct 29"). Facts are computed from the OPEN slice only — forming prices are
 * not commitments — and any fact lacking data is omitted, never invented.
 *
 * A row with zero open/forming inventory renders the notify capture
 * (source "homepage-{audience}") instead of empty cards — never a blank row.
 *
 * The section header is always rendered (even mid-fetch or with zero open
 * programs) so the homepage's `#programs` anchor always has visible content;
 * the Playwright homepage tests (public-pages.spec.ts, landing-pages.spec.ts)
 * depend on that and on the header's "All programs →" link.
 */

const ROW_LIMIT = 3

/** Open first (soonest deadline), forming after, capped at ROW_LIMIT. */
function rowItems(seasons: ApiSeason[]): ApiSeason[] {
  const open = seasons.filter((s) => s.status === "open").sort(byRegistrationCloses)
  const forming = seasons.filter((s) => s.status === "forming").sort(byRegistrationCloses)
  return [...open, ...forming].slice(0, ROW_LIMIT)
}

function joinFacts(parts: Array<string | null>): string | null {
  const kept = parts.filter((p): p is string => p != null && p.length > 0)
  return kept.length > 0 ? kept.join(" · ") : null
}

const closesLabel = (d: Date | null) =>
  d != null
    ? `closes ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
    : null

/** "Fall 2026 · $120 solo / $200 reserves a team · closes Sep 3" */
function adultFactsLine(open: ApiSeason[]): string | null {
  const price = minIndividualPrice(open)
  const teamTotal = minTeamTotal(open)
  const priceParts = [
    price != null ? `$${price.toLocaleString("en-US")} solo` : null,
    // $200 is the flat captain deposit (authoritative constant — the
    // team-create flow charges exactly this); only advertised when at least
    // one open season actually accepts a team.
    teamTotal != null ? `$${CAPTAIN_DEPOSIT_DOLLARS.toLocaleString("en-US")} reserves a team` : null,
  ].filter((p): p is string => p != null)
  return joinFacts([
    primaryTermLabel(open),
    priceParts.length > 0 ? priceParts.join(" / ") : null,
    closesLabel(earliestRegistrationCloses(open)),
  ])
}

/** "Winter I · ages 4–12 · $50 holds a spot · closes Oct 29" */
function youthFactsLine(open: ApiSeason[]): string | null {
  const ages = ageRangeAcross(open)
  const deposit = minHoldDeposit(open)
  return joinFacts([
    primaryTermLabel(open),
    ages != null ? `ages ${ages.min}–${ages.max}` : null,
    deposit != null ? `$${deposit.toLocaleString("en-US")} holds a spot` : null,
    closesLabel(earliestRegistrationCloses(open)),
  ])
}

export default function HomepageProgramsPreview() {
  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchPublicCatalogSeasons()
      .then((all) => {
        if (!cancelled) setSeasons(all)
      })
      .catch(() => {
        // Silent — the notify fallback renders when no data.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Advertisable inventory only: open (register) + forming (interest list).
  // Audience derivation goes through deriveAudience — the nested
  // program.audienceType plus age-range signals, never a top-level field.
  const advertisable = seasons.filter((s) => s.status === "open" || s.status === "forming")
  const adultLeagues = advertisable.filter(
    (s) => deriveAudience(s) === "adult" && s.program.programType === "league",
  )
  const youthAll = advertisable.filter((s) => deriveAudience(s) === "youth")

  // Facts compute over the OPEN slice only (leagues for adults; every youth
  // program type for kids — the row spans them all).
  const adultOpen = openScopedSeasons(seasons, "adult", ["league"])
  const youthOpen = seasons.filter((s) => s.status === "open" && deriveAudience(s) === "youth")

  return (
    <section className="bg-cream py-20 lg:py-28">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header — always present so the homepage's #programs
            anchor has visible content even before the fetch resolves
            or when zero programs are currently open. */}
        {/* No eyebrow above the headline (the no-eyebrow rule) — "open for
            registration" is what the facts lines under each row already say. */}
        <div className="flex items-end justify-between mb-12">
          <h2 className="display-l text-ink">Pick your season</h2>
          <a href="/programs" className="text-sm font-medium text-primary-text hover:underline">
            All programs →
          </a>
        </div>

        <AudienceRow
          title="For adults"
          facts={adultFactsLine(adultOpen)}
          items={rowItems(adultLeagues)}
          linkHref="/adult/leagues"
          linkLabel="All adult leagues →"
          notifyAudience="adult"
          notifySource="homepage-adult"
          loading={loading}
        />
        <AudienceRow
          title="For kids"
          facts={youthFactsLine(youthOpen)}
          items={rowItems(youthAll)}
          linkHref="/youth/leagues"
          linkLabel="All youth programs →"
          notifyAudience="parent"
          notifySource="homepage-youth"
          loading={loading}
        />
      </div>
    </section>
  )
}

function AudienceRow({
  title,
  facts,
  items,
  linkHref,
  linkLabel,
  notifyAudience,
  notifySource,
  loading,
}: {
  title: string
  facts: string | null
  items: ApiSeason[]
  linkHref: string
  linkLabel: string
  notifyAudience: "parent" | "adult"
  notifySource: string
  loading: boolean
}) {
  return (
    <div className="mb-14 last:mb-0">
      {/* Row header: audience title + mono facts line, row link right */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-5">
        <div className="min-w-0">
          <h3 className="display-s text-ink">{title}</h3>
          {!loading && facts && (
            <p className="font-mono text-[11px] tracking-[0.02em] text-ink-muted mt-1.5">
              {facts}
            </p>
          )}
        </div>
        <a href={linkHref} className="text-sm font-medium text-primary-text hover:underline">
          {linkLabel}
        </a>
      </div>

      {loading ? (
        <CardGrid layout="grid">
          {[0, 1, 2].map((i) => (
            <ProgramCardSkeleton key={i} />
          ))}
        </CardGrid>
      ) : items.length > 0 ? (
        <CardGrid layout="grid">
          {items.map((s) => (
            <ProgramCardV2 key={s.id} season={s} />
          ))}
        </CardGrid>
      ) : (
        // Zero-inventory fallback — never a blank row.
        <div className="bg-paper border border-border rounded-2xl px-5 py-6">
          <p className="text-ink-muted text-sm">
            Registration opens soon —{" "}
            <span className="font-medium text-ink">get notified</span>.
          </p>
          <div className="max-w-md">
            <EmptyNotifyForm audience={notifyAudience} source={notifySource} />
          </div>
        </div>
      )}
    </div>
  )
}
