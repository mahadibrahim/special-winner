"use client"

import { ArrowRight, Clock, MapPin } from "lucide-react"
import type { SessionCardData } from "@/components/dropin/SessionCard"

/**
 * Editorial pickup card for the /adult finder. A visual sibling of
 * ProgramCardV2 — same shell (sport-tinted media header, body, CTA pinned
 * to a bottom band) on the cream design system. Deliberately distinct from
 * the stone-gray SessionCard that the standalone /dropin page still uses.
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

  return (
    <a
      href={`/dropin/${session.id}`}
      className="group h-full flex flex-col bg-paper border border-border rounded-2xl overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-0.5"
    >
      {/* Media slot — sport tint, mirrors ProgramCardV2's header */}
      <div
        className="relative h-20 flex-shrink-0"
        style={{
          // `${tint}cc` appends hex alpha (80%) — assumes tint is a 6-digit hex.
          background: `linear-gradient(135deg, ${tint}, ${tint}cc)`,
        }}
      >
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {session.sportOrClassLabel}
          {session.formatLabel ? ` · ${session.formatLabel}` : ""}
        </span>
        <span className="absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-cream/90 text-ink-2">
          Pickup
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {/* When — the headline for a pickup session */}
        <h3 className="font-display text-base leading-tight text-ink">
          {formatDay(session.startsAt)}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1.5">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span>
            {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
          </span>
        </div>
        {session.venueName && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{session.venueName}</span>
          </div>
        )}

        {/* Skill badge — at most one, mirrors ProgramCardV2's format badge */}
        <div className="mt-2">
          <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
            {session.skillLevel.replace("_", " ")}
          </span>
        </div>

        {/* Spacer pushes price + CTA to a consistent bottom band */}
        <div className="flex-1 min-h-[0.75rem]" />

        <div className="pt-3 border-t border-border flex items-end justify-between">
          <div>
            <div className="font-display text-lg text-ink leading-none">
              {priceLabel(session, defaultSessionRateCents)}
            </div>
            <div className="text-[11px] text-ink-muted mt-1">
              {isFull ? "Waitlist" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors">
            {isFull ? "Join waitlist" : "Book"}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </a>
  )
}
