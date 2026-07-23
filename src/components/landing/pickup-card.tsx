"use client"

import { ArrowRight, Calendar, Clock, MapPin } from "lucide-react"
import type { SessionCardData } from "@/components/dropin/SessionCard"
import { skillLevelDisplay } from "@/lib/landing/skill-levels"
import { CardShell } from "@/components/programs/card-shell"
import { VenueLink } from "@/components/programs/venue-link"

/**
 * Pickup variant of the canonical card. Consumes the same `CardShell` as
 * `ProgramCardV2` (media h-28, title clamp, fixed chip slot) so pickup and
 * league cards land row-aligned in mixed grids by construction — this used
 * to be a hand-rolled "visual sibling" (media h-20, no title clamp) that
 * drifted from the canonical shape; see card-system-consolidation plan,
 * Task 2.
 *
 * Renders per-SESSION data (a single scheduled pickup/class slot), not a
 * season: title = day headline, meta A = venue · "Pickup", meta B = time
 * window, meta C = session date (Calendar row — intentionally restates the
 * headline date so every card in the family keeps the same 3 icon rows),
 * chip = skill badge, footer = price + spots-left/waitlist CTA.
 */

// Sport tint by fuzzy label match — pickup sessions carry a free-text
// `sportOrClassLabel`, not a sport slug, so we match on substring.
const SPORT_TINTS: ReadonlyArray<{ match: string; color: string }> = [
  { match: "soccer", color: "#16a34a" },
  { match: "basketball", color: "#f97316" },
  { match: "baseball", color: "#dc2626" },
  { match: "football", color: "#a16207" },
  { match: "hockey", color: "#0ea5e9" },
  { match: "volleyball", color: "#9333ea" },
]

function sportTint(label: string): string {
  const lower = label.toLowerCase()
  return SPORT_TINTS.find((t) => lower.includes(t.match))?.color ?? "#52525b"
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function priceLabel(s: SessionCardData, defaultRateCents: number | null): string {
  const cents = s.sessionRateCents ?? defaultRateCents
  if (cents == null || cents === 0) return "Free"
  return `$${(cents / 100).toFixed(0)}`
}

export default function PickupCard({
  session,
  defaultSessionRateCents,
}: {
  session: SessionCardData
  defaultSessionRateCents: number | null
}) {
  const tint = sportTint(session.sportOrClassLabel)
  const spotsLeft = Math.max(0, session.capacity - session.confirmedCount)
  const isFull = spotsLeft === 0
  const dayLabel = formatDay(session.startsAt)

  return (
    <CardShell
      sportColor={tint}
      mediaBottomLeft={
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {session.sportOrClassLabel}
          {session.formatLabel ? ` · ${session.formatLabel}` : ""}
        </span>
      }
      mediaTopRight={
        <span className="absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-cream/90 text-ink-2">
          Pickup
        </span>
      }
      title={dayLabel}
      metaA={
        // Venue · "Pickup". No `location.slug` on session data yet — the
        // /api/dropin/sessions endpoint only returns venueId/venueName — so
        // this falls back to plain text per the "never a dead link" rule
        // until that field is threaded through (server change, out of scope
        // here). Always renders (em-dash fallback), never omitted.
        <>
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            <VenueLink slug={null} label={session.venueName ?? "—"} />
            {" · Pickup"}
          </span>
        </>
      }
      metaB={
        <>
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
          </span>
        </>
      }
      metaC={
        <>
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{dayLabel}</span>
        </>
      }
      chip={
        <span
          className={`inline-flex items-center font-semibold tracking-wide uppercase text-[10px] px-2 py-0.5 rounded ${skillLevelDisplay(session.skillLevel).badgeClass}`}
        >
          {skillLevelDisplay(session.skillLevel).label}
        </span>
      }
      footer={
        <div className="pt-3 border-t border-border flex items-end justify-between">
          <div>
            <div className="font-display text-lg text-ink leading-none">
              {priceLabel(session, defaultSessionRateCents)}
            </div>
            <div className="text-[11px] text-ink-muted mt-1">
              {isFull ? "Waitlist" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
            </div>
          </div>
          <a
            href={`/dropin/${session.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors"
          >
            {isFull ? "Join waitlist" : "Book"}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      }
    />
  )
}
