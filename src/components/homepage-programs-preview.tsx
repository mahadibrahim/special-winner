"use client"

import { useEffect, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { deriveAudience } from "@/lib/programs/derive"
import { byRegistrationCloses } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

/**
 * Homepage "Open now" strip — deadline-sorted, cross-audience.
 *
 * Single 3-card grid spanning both Youth and Adult open programs, sorted by
 * `byRegistrationCloses` (soonest deadline first) so urgent inventory leads.
 * Each card gets an audience badge overlay (orange = Adult, emerald = Youth)
 * so a mixed grid stays legible without audience-split rows.
 *
 * The section header is always rendered (even mid-fetch or with zero open
 * programs) so the homepage's `#programs` anchor always has visible content;
 * the Playwright homepage test (public-pages.spec.ts) depends on that.
 */

const STRIP_LIMIT = 3

const AUDIENCE_BADGE: Record<string, { label: string; cls: string }> = {
  adult: { label: "Adult", cls: "bg-primary text-cream" },
  youth: { label: "Youth", cls: "bg-emerald-600 text-cream" },
}

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
        // Silent — empty state renders when no data.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stripItems = [...seasons]
    .filter((s) => {
      const a = deriveAudience(s)
      return a === "adult" || a === "youth"
    })
    .sort(byRegistrationCloses)
    .slice(0, STRIP_LIMIT)

  const hasContent = stripItems.length > 0

  return (
    <section className="bg-cream py-20 lg:py-28">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header — always present so the homepage's #programs
            anchor has visible content even before the fetch resolves
            or when zero programs are currently open. */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary mb-3 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-primary" />
              Open for registration
            </p>
            <h2
              className="font-display text-ink leading-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", letterSpacing: "-0.025em" }}
            >
              Pick your season.
            </h2>
          </div>
          <a href="/programs" className="text-sm font-medium text-primary hover:underline">
            All programs →
          </a>
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
            at the audience finders so they still have somewhere to go. */}
        {!loading && !hasContent && (
          <p className="text-ink-muted text-base max-w-xl">
            New programs are added each season. Head to{" "}
            <a href="/adult/leagues" className="text-primary font-medium hover:underline">
              adult leagues
            </a>{" "}
            or{" "}
            <a href="/youth/leagues" className="text-primary font-medium hover:underline">
              youth leagues
            </a>{" "}
            to see what's coming up — or check back soon.
          </p>
        )}

        {/* Single cross-audience grid sorted by deadline */}
        {!loading && hasContent && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stripItems.map((s) => {
              const audience = deriveAudience(s) as "adult" | "youth"
              const badge = AUDIENCE_BADGE[audience]
              return (
                <div key={s.id} className="relative">
                  <span
                    className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-[0.12em] uppercase px-2 py-0.5 rounded ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <ProgramCardV2 season={s} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
