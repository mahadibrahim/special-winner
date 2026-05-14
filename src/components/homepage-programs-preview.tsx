"use client"

import { useEffect, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { deriveAudience, type SeasonForDerive } from "@/lib/programs/derive"

/**
 * Homepage "What's open now" — live inventory as proof-of-life.
 *
 * Two audience-split scroll rows — Youth and Adult — of real open programs.
 * Each row's "Browse all" link routes into the matching FINDER (/youth,
 * /adult), reinforcing the homepage's gateway split — not the old /programs
 * catalog.
 *
 * The section header is always rendered (even mid-fetch or with zero open
 * programs) so the homepage's `#programs` anchor always has visible content;
 * the Playwright homepage test depends on that. A row self-hides when its
 * audience has nothing open.
 */

interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  teamPrice: number | null
  signupModes: string[]
  scheduleNotes: string | null
  status: string
  registrationCloses?: string | null
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

const ROW_LIMIT = 6

interface AudienceRow {
  audience: "youth" | "adult"
  title: string
  href: string
  linkLabel: string
}

const ROWS: AudienceRow[] = [
  { audience: "youth", title: "Youth", href: "/youth", linkLabel: "Browse all youth →" },
  { audience: "adult", title: "Adult", href: "/adult", linkLabel: "Browse all adult →" },
]

export default function HomepageProgramsPreview() {
  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/public/seasons?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { seasons: ApiSeason[] }) => {
        if (!cancelled) setSeasons(j.seasons)
      })
      .catch(() => {
        // Silent — rows self-hide if no data.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rowItems = (audience: "youth" | "adult"): ApiSeason[] =>
    [...seasons]
      .filter((s) => deriveAudience(s) === audience)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, ROW_LIMIT)

  const visibleRows = ROWS.map((row) => ({ ...row, items: rowItems(row.audience) })).filter(
    (row) => row.items.length > 0,
  )
  const hasContent = visibleRows.length > 0

  return (
    <section className="bg-cream py-20 lg:py-28">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header — always present so the homepage's #programs
            anchor has visible content even before the fetch resolves
            or when zero programs are currently open. */}
        <div className="flex items-end justify-between mb-12 max-w-3xl">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary mb-3 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-primary" />
              What's open now
            </p>
            <h2
              className="font-display text-ink leading-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", letterSpacing: "-0.025em" }}
            >
              Real programs, taking registrations.
            </h2>
          </div>
        </div>

        {/* Loading state — three skeleton cards so the section has shape
            while data is in flight. */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-paper border border-border rounded-2xl h-[320px] animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Empty state — preserves section height and points the visitor
            at the finders so they still have somewhere to go. */}
        {!loading && !hasContent && (
          <p className="text-ink-muted text-base max-w-xl">
            New programs are added each season. Head to{" "}
            <a href="/youth" className="text-primary font-medium hover:underline">
              youth
            </a>{" "}
            or{" "}
            <a href="/adult" className="text-primary font-medium hover:underline">
              adult
            </a>{" "}
            to see what's coming up — or check back soon.
          </p>
        )}

        {/* Audience-split rows */}
        {!loading &&
          visibleRows.map((row) => (
            <div key={row.audience} className="mb-12 last:mb-0">
              <div className="flex items-end justify-between mb-4">
                <h3 className="font-display text-xl text-ink">{row.title}</h3>
                <a
                  href={row.href}
                  className="text-xs text-ink-muted hover:text-primary font-medium tracking-wide uppercase transition-colors"
                >
                  {row.linkLabel}
                </a>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x snap-mandatory">
                {row.items.map((s) => (
                  <div
                    key={`${row.audience}-${s.id}`}
                    className="flex-none w-[300px] sm:w-[320px] snap-start"
                  >
                    <ProgramCardV2 season={s} />
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
