"use client"

import { useEffect, useState } from "react"
import { deriveAudience, type SeasonForDerive } from "@/lib/programs/derive"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import type { SessionCardData } from "@/components/dropin/SessionCard"
import { SectionNav, type SectionNavItem } from "./section-nav"
import { SeasonsFinderSection } from "./seasons-finder-section"
import { PickupFinderSection } from "./pickup-finder-section"

/**
 * The /adult finder — the interactive heart of the redesigned adult landing
 * page. One island that:
 *   • fetches the seasons catalog once (split into Leagues + Tournaments by
 *     programType) and the drop-in sessions once (Pickup),
 *   • renders the sticky section-nav + the three stacked finder sections,
 *   • runs a scroll-spy so the nav highlights the section in view.
 *
 * Everything an adult needs — find a league, play pickup, register for a
 * tournament — resolves on this page without navigating away.
 */

/** Shape of a season row from `/api/public/seasons`. Structurally satisfies
 *  both `SeasonForDerive` and `ProgramCardV2`'s `Season` prop. */
export interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  registeredCount: number
  maxParticipants: number | null
  pricingMode: string
  signupModes?: string[]
  registrationCloses?: string | null
  program: {
    id: string
    name: string
    slug: string
    programType: string
    audienceType: string
  }
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

interface DropInApiResponse {
  sessions: SessionCardData[]
  defaults: { defaultSessionRateCents: number; defaultMemberRateCents: number } | null
}

const NAV_ITEMS: SectionNavItem[] = [
  { id: "leagues", label: "Leagues", icon: "⚽" },
  { id: "pickup", label: "Pickup", icon: "🟢" },
  { id: "tournaments", label: "Tournaments", icon: "🏆" },
]

export default function AdultFinder() {
  useHydrationBeacon()

  const [seasons, setSeasons] = useState<ApiSeason[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [pickupSessions, setPickupSessions] = useState<SessionCardData[]>([])
  const [pickupDefaultRate, setPickupDefaultRate] = useState<number | null>(null)
  const [pickupLoading, setPickupLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>("leagues")

  // Seasons fetch — shared by Leagues + Tournaments.
  useEffect(() => {
    let cancelled = false
    fetch("/api/public/seasons?status=open")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { seasons: ApiSeason[] }) => {
        if (!cancelled) setSeasons(j.seasons)
      })
      .catch(() => {
        // Silent — sections render their own empty state.
      })
      .finally(() => {
        if (!cancelled) setSeasonsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Drop-in sessions fetch — Pickup. Org-scoped server-side via the host.
  useEffect(() => {
    let cancelled = false
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: DropInApiResponse) => {
        if (cancelled) return
        setPickupSessions(j.sessions)
        setPickupDefaultRate(j.defaults?.defaultSessionRateCents ?? null)
      })
      .catch(() => {
        // Silent — Pickup section renders its own empty state.
      })
      .finally(() => {
        if (!cancelled) setPickupLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Scroll-spy — highlight whichever section is crossing the upper-middle of
  // the viewport. The section <section id> wrappers always render (even while
  // loading), so they're queryable right after mount.
  useEffect(() => {
    const els = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Adult-audience seasons, split by program type.
  const adultSeasons = seasons.filter((s) => deriveAudience(s) === "adult")
  const leagues = adultSeasons.filter((s) => s.program.programType === "league")
  const tournaments = adultSeasons.filter((s) => s.program.programType === "tournament")

  // Adult / all-ages pickup sessions only (the endpoint returns classes and
  // youth sessions too).
  const adultPickup = pickupSessions.filter(
    (s) => s.kind === "pickup" && s.audience !== "youth",
  )

  return (
    // Wrapping div is the sticky containing block for SectionNav — it keeps
    // the nav pinned across the three sections, then releases it once the
    // visitor scrolls past Tournaments into Testimonials / the CTA banner.
    <div>
      <SectionNav items={NAV_ITEMS} active={activeSection} />

      <SeasonsFinderSection
        id="leagues"
        icon="⚽"
        title="Leagues"
        descriptor="Season-long play. Sign up a full team or join as a free agent."
        seasons={leagues}
        loading={seasonsLoading}
        emptyCtaAudience="adult"
      />

      <PickupFinderSection
        id="pickup"
        icon="🟢"
        title="Pickup"
        descriptor="Next two weeks — show up and play. No commitment."
        sessions={adultPickup}
        defaultSessionRateCents={pickupDefaultRate}
        loading={pickupLoading}
      />

      <SeasonsFinderSection
        id="tournaments"
        icon="🏆"
        title="Tournaments"
        descriptor="One-day events. Bring a team or sign up and get placed."
        seasons={tournaments}
        loading={seasonsLoading}
      />
    </div>
  )
}
