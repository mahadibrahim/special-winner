"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchPublicCatalogSeasons } from "@/lib/programs/public-seasons-client"
import { scopeSeasons, type CategoryAudience } from "@/lib/programs/category-pages"
import { groupByTerm, type TermGroup } from "@/lib/leagues/terms"
import { parseDateOnly } from "@/lib/time/format-date"
import { SeasonInterestForm } from "@/components/programs/season-interest-form"
import { EmptyNotifyForm } from "./empty-notify-form"
import type { ApiSeason } from "@/lib/programs/api-season"

/**
 * Year-round season calendar band: one cell per term. Live cells come from
 * the public catalog grouped by termSlug/termLabel — an open term gets a
 * "Registering now" chip linking to the cards section; a forming term keeps
 * its term-scoped SeasonInterestForm. Terms with no season in the catalog yet
 * render from the page's authored config with the generic newsletter capture
 * (source-tagged per term).
 *
 * FOLLOW-UP: future terms are authored config today because upcoming seasons
 * don't exist in the DB yet. Once seasons carry a registrationOpens date and
 * are created ahead of time (status=forming), the config array can go away
 * and every cell — including "opens {date}" chips — becomes data-driven.
 *
 * Aspire-brand pages only — cream-idiom tokens invert under the SoccerOne
 * theme; do not import into SoccerOne-brand pages.
 */

export interface CalendarTermConfig {
  /** Display name, e.g. "Winter I". */
  name: string
  /** Authored month range, e.g. "Dec–Feb" (estimate until data-driven). */
  months: string
  /** Optional games count line, e.g. "7 games". */
  games?: string
  /** Optional "Opens Aug 1"-style chip copy source; omitted → "Get notified". */
  opensDate?: string
  /** Term-slug stem this cell matches (e.g. "winter-i" matches
   *  "winter-i-2027"); a live term hides the authored cell. Also used as the
   *  newsletter source suffix. */
  match: string
}

interface SeasonCalendarBandProps {
  audience: CategoryAudience
  programTypes: string[]
  /** Attribution key for notify signups, e.g. "adult-leagues" →
   *  source "calendar-adult-leagues-winter-i". */
  pageKey: string
  /** Anchor id of the page's cards/finder section ("Registering now" links there). */
  cardsSectionId: string
  heading: string
  descriptor: string
  futureTerms: CalendarTermConfig[]
  /** Authored games-count line for LIVE cells (e.g. "7 games"); omitted when
   *  the page can't claim one. */
  liveGamesLabel?: string
}

function matchesTerm(termSlug: string, stem: string): boolean {
  return termSlug === stem || termSlug.startsWith(`${stem}-`)
}

const MONTH = { month: "short" } as const

/** ApiSeason narrowed to the shape groupByTerm requires. */
type TermApiSeason = ApiSeason & {
  termSlug: string
  termLabel: string | null
  status: "open" | "forming"
}

function monthsRange(group: TermGroup<TermApiSeason>): string {
  let start: Date | null = null
  let end: Date | null = null
  for (const s of group.seasons) {
    const st = parseDateOnly(s.startDate)
    const en = parseDateOnly(s.endDate)
    if (!start || st < start) start = st
    if (!end || en > end) end = en
  }
  if (!start || !end) return ""
  const a = start.toLocaleDateString("en-US", MONTH)
  const b = end.toLocaleDateString("en-US", MONTH)
  return a === b ? a : `${a}–${b}`
}

export default function SeasonCalendarBand({
  audience,
  programTypes,
  pageKey,
  cardsSectionId,
  heading,
  descriptor,
  futureTerms,
  liveGamesLabel,
}: SeasonCalendarBandProps) {
  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [openForm, setOpenForm] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicCatalogSeasons()
      .then((all) => {
        if (!cancelled) setSeasons(all)
      })
      .catch(() => {
        // Silent — authored cells still render.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const liveGroups = useMemo(() => {
    // ApiSeason's term/status fields are optional on the wire type; the
    // filter guarantees termSlug + a live status, and termLabel defaults to
    // null so the set satisfies TermSeason.
    const scoped = scopeSeasons(seasons, audience, programTypes)
      .filter((s) => Boolean(s.termSlug) && (s.status === "open" || s.status === "forming"))
      .map((s) => ({ ...s, termLabel: s.termLabel ?? null }) as TermApiSeason)
    return groupByTerm(scoped)
  }, [seasons, audience, programTypes])

  const authoredCells = useMemo(
    () => futureTerms.filter((cfg) => !liveGroups.some((g) => matchesTerm(g.slug, cfg.match))),
    [futureTerms, liveGroups],
  )

  const chipBase =
    "inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"

  return (
    <section className="py-12 lg:py-16 border-t border-border">
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9">
        <h2 className="font-display text-2xl lg:text-3xl text-ink">{heading}</h2>
        <p className="text-ink-muted mt-1">{descriptor}</p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {liveGroups.map((g) => {
            const formingSeason = g.hasOpen ? null : g.seasons.find((s) => s.status === "forming")
            return (
              <div key={g.slug} className="bg-paper border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl text-ink">{g.label}</h3>
                  {g.hasOpen && (
                    <a
                      href={`#${cardsSectionId}`}
                      className={`${chipBase} bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20 transition-colors`}
                    >
                      ● Registering now
                    </a>
                  )}
                </div>
                <div className="font-mono text-xs text-ink-muted mt-1.5">
                  {monthsRange(g)}
                  {liveGamesLabel ? ` · ${liveGamesLabel}` : ""}
                </div>
                {formingSeason &&
                  (openForm === g.slug ? (
                    <div className="mt-3">
                      <SeasonInterestForm
                        seasonId={formingSeason.id}
                        seasonName={formingSeason.name}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenForm(g.slug)}
                      className={`${chipBase} mt-3 bg-cream-2 text-ink-2 border-border hover:bg-cream-3 transition-colors cursor-pointer`}
                    >
                      Get notified
                    </button>
                  ))}
              </div>
            )
          })}

          {authoredCells.map((cfg) => (
            <div key={cfg.match} className="bg-paper border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-xl text-ink">{cfg.name}</h3>
                {cfg.opensDate && (
                  <span
                    className={`${chipBase} bg-amber-500/10 text-amber-700 border-amber-500/20`}
                  >
                    Opens {cfg.opensDate}
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-ink-muted mt-1.5">
                {cfg.months}
                {cfg.games ? ` · ${cfg.games}` : ""}
              </div>
              {openForm === cfg.match ? (
                <EmptyNotifyForm
                  audience={audience === "youth" ? "parent" : "adult"}
                  source={`calendar-${pageKey}-${cfg.match}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenForm(cfg.match)}
                  className={`${chipBase} mt-3 bg-cream-2 text-ink-2 border-border hover:bg-cream-3 transition-colors cursor-pointer`}
                >
                  Get notified
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
