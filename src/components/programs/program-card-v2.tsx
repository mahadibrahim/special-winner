"use client"

import { Calendar, MapPin, ArrowRight } from "lucide-react"
import {
  deriveStatusPill,
  derivePriceUnit,
  deriveDuration,
  deriveDeadline,
  type SeasonForDerive,
} from "@/lib/programs/derive"

interface Season extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  scheduleNotes: string | null
  sport: { name: string; slug: string; icon: string | null }
  location: { name: string; slug: string; city: string | null }
  ageGroup: { name: string; minAge: number; maxAge: number } | null
}

const TONE_STYLES: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  filling: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  last: "bg-amber-600/15 text-amber-800 dark:text-amber-300",
}

export default function ProgramCardV2({ season }: { season: Season }) {
  const status = deriveStatusPill(season)
  const priceUnit = derivePriceUnit(season)
  const duration = deriveDuration(season)
  const deadline = deriveDeadline(season)

  const venueLabel = season.location.name.replace(/^Soccer One\s+/i, "")
  const formatLabel = season.program.programType !== "league"
    ? season.program.programType.charAt(0).toUpperCase() + season.program.programType.slice(1)
    : null

  return (
    <a
      href={`/register/${season.id}`}
      className="group block bg-paper border border-border rounded-2xl p-5 transition-all hover:border-primary/40 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight text-ink mb-1.5 truncate">
            {season.name}
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

      <div className="flex items-end justify-between pt-3 border-t border-border">
        <div>
          <div className="font-display text-xl text-ink leading-none">
            ${season.price.toLocaleString()}
          </div>
          <div className="text-xs text-ink-muted mt-1">
            {priceUnit} · {duration}
          </div>
          {deadline && (
            <div className="text-[10px] uppercase tracking-wide text-ink-faint mt-1.5">
              {deadline}
            </div>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors">
          Register
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </a>
  )
}
