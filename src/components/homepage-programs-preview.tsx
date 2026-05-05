"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import type { SeasonForDerive } from "@/lib/programs/derive"

/**
 * Homepage programs preview — curated, not exhaustive.
 *
 * The full F-Hybrid catalog (segmenter + chips + featured rows + grid)
 * lives at /programs. The homepage has a different job: validate that
 * we have real inventory, drive clicks toward the catalog or directly
 * to register, and stay tight.
 *
 * Pattern: two horizontal-scroll rows of curated programs.
 *  • "Filling up" — programs ≥60% full (social proof)
 *  • "Starting soon" — earliest start dates (urgency)
 *
 * Auto-hides when no programs are open (so a freshly-deployed catalog
 * doesn't render an awkward empty state on the homepage).
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
        // Silent — section auto-hides if no data
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || seasons.length === 0) return null

  const fillingUp = seasons
    .filter((s) => s.maxParticipants && s.registeredCount / s.maxParticipants >= 0.6)
    .slice(0, ROW_LIMIT)
  const startingSoon = [...seasons]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, ROW_LIMIT)

  // If "Filling up" is empty, only show "Starting soon" — keeps the
  // homepage from showing two near-identical rows when capacity data
  // is sparse.
  const rows: Array<{ title: string; items: ApiSeason[] }> = []
  if (fillingUp.length > 0) rows.push({ title: "Filling up", items: fillingUp })
  rows.push({ title: "Starting soon", items: startingSoon })

  return (
    <section className="bg-cream py-20 lg:py-28">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex items-end justify-between mb-12 max-w-3xl">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary mb-3 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-primary" />
              What's open
            </p>
            <h2
              className="font-display text-ink leading-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", letterSpacing: "-0.025em" }}
            >
              Real programs, taking registrations now.
            </h2>
          </div>
        </div>

        {/* Rows */}
        {rows.map((row) => (
          <div key={row.title} className="mb-10">
            <div className="flex items-end justify-between mb-4">
              <h3 className="font-display text-xl text-ink">{row.title}</h3>
              <a
                href="/programs"
                className="text-xs text-ink-muted hover:text-primary font-medium tracking-wide uppercase transition-colors"
              >
                See all →
              </a>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x snap-mandatory">
              {row.items.map((s) => (
                <div key={`${row.title}-${s.id}`} className="flex-none w-[300px] sm:w-[320px] snap-start">
                  <ProgramCardV2 season={s} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Browse all CTA */}
        <div className="text-center mt-12">
          <a
            href="/programs"
            className="inline-flex items-center gap-3 bg-ink text-cream px-8 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary transition-colors"
            style={{ letterSpacing: "0.08em" }}
          >
            Browse all programs
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
