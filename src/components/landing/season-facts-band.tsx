"use client"

import { useEffect, useState } from "react"
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"
import { fetchPublicCatalogSeasons } from "@/lib/programs/public-seasons-client"
import {
  openScopedSeasons,
  minIndividualPrice,
  minTeamTotal,
  earliestRegistrationCloses,
  earliestStartDate,
  minHoldDeposit,
  primaryVenueName,
} from "@/lib/programs/season-facts"
import type { CategoryAudience } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"
import { formatDateOnly } from "@/lib/time/format-date"

/**
 * "Season at a glance" — a horizontal key-value band under a category-page
 * hero. Live facts (price, team offer, deadline, kickoff, deposit) are
 * computed from the OPEN seasons in the public catalog; one authored fact per
 * page carries copy the data can't (adult "7-game season", youth game-day
 * window). Facts with no backing data are omitted, never invented.
 *
 * Aspire-brand pages only — cream-idiom tokens invert illegibly under the
 * SoccerOne theme (see memory: soccerone-brandtheme-inverts-aspire-tokens).
 */

interface Fact {
  label: string
  value: string
}

interface SeasonFactsBandProps {
  audience: CategoryAudience
  /** Program types the facts are computed over — leagues only on both pages,
   *  so a cheap clinic never becomes the headline "$40 / kid". */
  programTypes: string[]
  /** Page-specific authored fact (adult: format, youth: game days). */
  authoredFact: Fact
  /** Anchor of the page's FAQ section, e.g. "#faq". */
  faqHref: string
  /** Youth only: render the home-venue note line under the facts. */
  locationNote?: boolean
  /** Authored fallback when no open season carries a venue. */
  fallbackVenueName?: string
}

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`

export default function SeasonFactsBand({
  audience,
  programTypes,
  authoredFact,
  faqHref,
  locationNote = false,
  fallbackVenueName = "Worthington",
}: SeasonFactsBandProps) {
  const [seasons, setSeasons] = useState<ApiSeason[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicCatalogSeasons()
      .then((all) => {
        if (!cancelled) setSeasons(all)
      })
      .catch(() => {
        // Degrade to the authored fact + links — never block the page.
        if (!cancelled) setSeasons([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = seasons === null
  const open = openScopedSeasons(seasons ?? [], audience, programTypes)

  const facts: Fact[] = []
  const unit = audience === "youth" ? "kid" : "player"

  const price = minIndividualPrice(open)
  if (price != null) facts.push({ label: "Price", value: `${dollars(price)} / ${unit}` })

  if (audience === "adult") {
    // Team offer: $200 down is the flat captain deposit (authoritative
    // constant — the team-create flow charges exactly this); the total is the
    // cheapest effective (early-bird-aware) team fee across open seasons.
    const teamTotal = minTeamTotal(open)
    if (teamTotal != null) {
      facts.push({
        label: "Team signup",
        value: `${dollars(CAPTAIN_DEPOSIT_DOLLARS)} down · ${dollars(teamTotal)} total`,
      })
    }
  } else {
    // Youth: smallest valid hold-a-spot deposit; omitted when none is valid.
    const deposit = minHoldDeposit(open)
    if (deposit != null) {
      facts.push({ label: "Deposit", value: `${dollars(deposit)} holds a spot` })
    }
  }

  const closes = earliestRegistrationCloses(open)
  if (closes != null) {
    facts.push({
      label: "Registration",
      // registrationCloses is a real instant; render its UTC calendar day —
      // same treatment as the early-bird deadline label on program cards.
      value: `Closes ${closes.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
    })
  }

  const start = earliestStartDate(open)
  if (start != null) {
    facts.push({
      label: "Kickoff",
      value: `Week of ${formatDateOnly(start, { month: "short", day: "numeric" })}`,
    })
  }

  facts.push(authoredFact)

  const venue = primaryVenueName(open) ?? fallbackVenueName

  return (
    <section aria-label="Season at a glance" className="bg-paper border-b border-border">
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 py-7">
        {loading ? (
          <div className="flex flex-wrap gap-x-10 gap-y-5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-2.5 w-16 bg-cream-3 rounded" />
                <div className="h-6 w-32 bg-cream-2 rounded mt-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
            {facts.map((f) => (
              <div key={f.label}>
                <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
                  {f.label}
                </div>
                <div className="font-display text-xl text-ink mt-1">{f.value}</div>
              </div>
            ))}
            <div className="ml-auto self-center flex items-center gap-5 text-sm font-medium whitespace-nowrap">
              {/* Only link things that exist: the on-page FAQ and the refund
                  policy page. No rules / schedule-request pages yet. */}
              <a href={faqHref} className="text-primary hover:underline">
                FAQs
              </a>
              <a href="/refund-policy" className="text-primary hover:underline">
                Refund policy
              </a>
            </div>
          </div>
        )}
        {locationNote && !loading && (
          <p className="mt-5 pt-4 border-t border-border text-sm text-ink-muted">
            Home venue: {venue}. Occasionally a game shifts to our Downtown location — you&apos;ll
            always get advance notice by text &amp; email.
          </p>
        )}
      </div>
    </section>
  )
}
