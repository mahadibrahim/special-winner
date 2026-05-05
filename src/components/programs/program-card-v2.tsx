"use client"

import { Calendar, MapPin, ArrowRight, User, Users } from "lucide-react"
import {
  deriveStatusPill,
  deriveIndividualUnit,
  deriveDuration,
  deriveDeadline,
  isDualMode,
  isTeamOnly,
  type SeasonForDerive,
} from "@/lib/programs/derive"

interface Season extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  sport: { name: string; slug: string; icon: string | null }
  location: { name: string; slug: string; city: string | null }
  ageGroup: { name: string; minAge: number; maxAge: number } | null
}

/**
 * Card heading display rule: when the season name is generic (just a
 * season indicator like "Summer 2026" with optional parenthetical), fall
 * back to "{program} — {season}" so a visitor scanning 100+ adult cards
 * can tell two leagues apart at a glance.
 *
 * Otherwise the season name already contains the differentiating info
 * (e.g. "Memorial Day Premier — Summer 2026"); display as-is.
 */
function isGenericSeasonName(name: string): boolean {
  const trimmed = name.trim()
  // "Summer 2026", "Fall 2026", "Spring 2025", optionally followed by a
  // parenthetical or short suffix. Anything longer or more specific is
  // considered intentional and used as-is.
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}(\s*[—\-(].{0,30})?$/i.test(trimmed)
}

const TONE_STYLES: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  filling: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  last: "bg-amber-600/15 text-amber-800 dark:text-amber-300",
}

export default function ProgramCardV2({ season }: { season: Season }) {
  const status = deriveStatusPill(season)
  const indivUnit = deriveIndividualUnit(season)
  const duration = deriveDuration(season)
  const deadline = deriveDeadline(season)
  const dual = isDualMode(season)
  const teamOnly = isTeamOnly(season)

  const venueLabel = season.location.name.replace(/^Soccer One\s+/i, "")
  const formatLabel = season.program.programType !== "league"
    ? season.program.programType.charAt(0).toUpperCase() + season.program.programType.slice(1)
    : null

  const programName = (season.program as { name?: string }).name ?? ""
  const headingName = isGenericSeasonName(season.name) && programName
    ? `${programName} — ${season.name}`
    : season.name

  // Display price: team-only shows the team price; dual shows both;
  // individual-only shows the individual price.
  const headlinePrice = teamOnly && season.teamPrice != null ? season.teamPrice : season.price
  const headlineUnit = teamOnly ? "per team" : indivUnit

  return (
    <div className="group bg-paper border border-border rounded-2xl p-5 transition-all hover:border-primary/40 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight text-ink mb-1.5 line-clamp-2">
            {headingName}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {venueLabel}
            </span>
            {season.ageGroup && (
              <>
                <span>·</span>
                <span>{season.ageGroup.name}</span>
              </>
            )}
            {formatLabel && (
              <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-cream-3 text-ink-2 px-2 py-0.5 rounded">
                {formatLabel}
              </span>
            )}
            {dual && (
              <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
                Solo or team
              </span>
            )}
            {teamOnly && (
              <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
                Team only
              </span>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full whitespace-nowrap ${TONE_STYLES[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      {season.scheduleNotes && (
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mb-3">
          <Calendar className="w-3 h-3" />
          <span className="truncate">{season.scheduleNotes}</span>
        </div>
      )}

      {/* Pricing — dual-mode shows both prices side by side; single-mode shows one. */}
      <div className="pt-3 border-t border-border">
        {dual && season.teamPrice != null ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="font-display text-xl text-ink leading-none">
                  ${season.price.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                  {indivUnit}
                </div>
              </div>
              <div className="border-l border-border pl-3">
                <div className="font-display text-xl text-ink leading-none">
                  ${season.teamPrice.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                  per team
                </div>
              </div>
            </div>
            <div className="text-xs text-ink-muted mb-3">{duration}</div>
            {deadline && (
              <div className="text-[10px] uppercase tracking-wide text-ink-faint mb-3">
                {deadline}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/register/${season.id}?mode=individual`}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors"
              >
                <User className="w-3.5 h-3.5" />
                Sign up solo
              </a>
              <a
                href={`/register/team/${season.id}`}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary px-3 py-2 rounded-md transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                Bring a team
              </a>
            </div>
          </>
        ) : (
          <div className="flex items-end justify-between">
            <div>
              <div className="font-display text-xl text-ink leading-none">
                ${headlinePrice.toLocaleString()}
              </div>
              <div className="text-xs text-ink-muted mt-1">
                {headlineUnit} · {duration}
              </div>
              {deadline && (
                <div className="text-[10px] uppercase tracking-wide text-ink-faint mt-1.5">
                  {deadline}
                </div>
              )}
            </div>
            <a
              href={teamOnly ? `/register/team/${season.id}` : `/register/${season.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors"
            >
              {teamOnly ? "Register team" : "Register"}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
