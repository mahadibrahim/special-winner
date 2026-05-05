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
 * Always renders the section header + "Browse all programs" CTA so the
 * `#programs` anchor on the homepage has visible content even while the
 * fetch is in flight or when zero programs are open. The Playwright
 * homepage test depends on this — and it's better UX than a collapsing
 * section.
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

  const fillingUp = seasons
    .filter((s) => s.maxParticipants && s.registeredCount / s.maxParticipants >= 0.6)
    .slice(0, ROW_LIMIT)
  const startingSoon = [...seasons]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, ROW_LIMIT)

  const rows: Array<{ title: string; items: ApiSeason[] }> = []
  if (fillingUp.length > 0) rows.push({ title: "Filling up", items: fillingUp })
  if (startingSoon.length > 0) rows.push({ title: "Starting soon", items: startingSoon })

  const hasContent = rows.length > 0

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

        {/* Loading state — three skeleton cards on a single row so the
            section has shape while data is in flight. */}
        {loading && (
          <div className="mb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-paper border border-border rounded-2xl p-5 h-[200px] animate-pulse"
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state — preserves section height and surfaces the
            primary CTA so the visitor still has somewhere to go. */}
        {!loading && !hasContent && (
          <p className="text-ink-muted text-base mb-10 max-w-xl">
            New programs are added each season. Browse the full catalog to see
            what's coming up — or check back soon.
          </p>
        )}

        {/* Rows */}
        {!loading && rows.map((row) => (
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

        {/* Browse all CTA — always present. */}
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
