"use client"

import { Calendar, MapPin, ArrowRight, User, Users, Clock } from "lucide-react"
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
  sport: { name: string; slug: string; icon: string | null; color: string | null }
  location: { name: string; slug: string; city: string | null }
  ageGroup: { name: string; minAge: number; maxAge: number } | null
}

/**
 * Card heading rule: a generic season name ("Summer 2026") is prefixed with
 * the program name so adult visitors scanning many cards can tell leagues
 * apart. Specific names ("Memorial Day Premier — Summer 2026") are used as-is.
 */
function isGenericSeasonName(name: string): boolean {
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}(\s*[—\-(].{0,30})?$/i.test(name.trim())
}

// Branded fallback colors for the media slot when a sport has no color set
// and no photo exists. Pre-launch every card renders this fallback.
const SPORT_FALLBACK_COLORS: Record<string, string> = {
  soccer: "#16a34a",
  basketball: "#f97316",
  baseball: "#dc2626",
  football: "#a16207",
  hockey: "#0ea5e9",
}

const STATUS_PILL_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700",
  filling: "bg-amber-100 text-amber-800",
  last: "bg-orange-100 text-orange-800",
}

export default function ProgramCardV2({ season }: { season: Season }) {
  const status = deriveStatusPill(season)
  const indivUnit = deriveIndividualUnit(season)
  const duration = deriveDuration(season)
  const deadline = deriveDeadline(season)
  const dual = isDualMode(season)
  const teamOnly = isTeamOnly(season)

  const programName = (season.program as { name?: string }).name ?? ""
  const headingName =
    isGenericSeasonName(season.name) && programName
      ? `${programName} — ${season.name}`
      : season.name

  // Normalized content contract — every line always resolves.
  const venueLabel = season.location.name.replace(/^Soccer One\s+/i, "")
  const audienceLabel = season.ageGroup
    ? season.ageGroup.name
    : season.program.audienceType === "adults"
      ? "Adult"
      : "All ages"
  const scheduleLabel = season.scheduleNotes ?? duration
  const sportColor =
    season.sport.color ?? SPORT_FALLBACK_COLORS[season.sport.slug] ?? "#52525b"

  // One format badge, hard cap. Priority: dual > team-only > non-league type.
  let formatBadge: string | null = null
  if (dual) formatBadge = "Solo or team"
  else if (teamOnly) formatBadge = "Team only"
  else if (season.program.programType !== "league")
    formatBadge =
      season.program.programType.charAt(0).toUpperCase() +
      season.program.programType.slice(1)

  const headlinePrice = teamOnly && season.teamPrice != null ? season.teamPrice : season.price
  const headlineUnit = teamOnly ? "per team" : indivUnit

  return (
    <div className="group h-full flex flex-col bg-paper border border-border rounded-2xl overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-0.5">
      {/* Media slot — sport-color fallback block. Photo support drops in here
          later with no structural change. */}
      <div
        className="relative h-28 flex-shrink-0"
        style={{
          // `${sportColor}cc` appends hex alpha (80%) — assumes sportColor is a
          // 6-digit hex. SPORT_FALLBACK_COLORS and the #52525b default all are.
          background: `linear-gradient(135deg, ${sportColor}, ${sportColor}cc)`,
        }}
      >
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {season.sport.icon ? `${season.sport.icon} ` : ""}
          {season.sport.name}
        </span>
        <span
          className={`absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${STATUS_PILL_STYLES[status.tone]}`}
        >
          {status.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {/* 1 · What — heading, reserved 2-line height */}
        <h3 className="font-display text-base leading-tight text-ink line-clamp-2 min-h-[2.5rem]">
          {headingName}
        </h3>

        {/* 2 · Who — location · age, always one line */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-2">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            {venueLabel} · {audienceLabel}
          </span>
        </div>

        {/* 3 · When it runs — schedule, always resolves */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{scheduleLabel}</span>
        </div>

        {/* 4 · When to act — deadline, conditional urgency */}
        {deadline && (
          <div
            className={`flex items-center gap-1.5 text-xs mt-1 ${
              deadline.urgent ? "text-primary font-semibold" : "text-ink-faint"
            }`}
          >
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{deadline.label}</span>
          </div>
        )}

        {/* Format badge — at most one */}
        {formatBadge && (
          <div className="mt-2">
            <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
              {formatBadge}
            </span>
          </div>
        )}

        {/* Spacer pushes price + CTA to a consistent bottom band */}
        <div className="flex-1 min-h-[0.75rem]" />

        {/* 5 · How much + CTA — dual-mode keeps two actions; preserved as-is */}
        <div className="pt-3 border-t border-border">
          {dual && season.teamPrice != null ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="font-display text-lg text-ink leading-none">
                    ${season.price.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                    {indivUnit}
                  </div>
                </div>
                <div className="border-l border-border pl-3">
                  <div className="font-display text-lg text-ink leading-none">
                    ${season.teamPrice.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                    per team
                  </div>
                </div>
              </div>
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
                <div className="font-display text-lg text-ink leading-none">
                  ${headlinePrice.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">{headlineUnit}</div>
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
    </div>
  )
}
