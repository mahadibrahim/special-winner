"use client"

import { useEffect, useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import type { SessionCardData } from "@/components/dropin/SessionCard"
import { PickupFinderSection } from "./pickup-finder-section"

/**
 * The island behind /adult/pickup. Same data + adult filter as the Pickup
 * section of the former /adult finder page, standalone — this
 * page IS the section.
 */

interface DropInApiResponse {
  sessions: SessionCardData[]
  defaults: { defaultSessionRateCents: number; defaultMemberRateCents: number } | null
}

export default function PickupPageFinder() {
  useHydrationBeacon()

  const [sessions, setSessions] = useState<SessionCardData[]>([])
  const [defaultRate, setDefaultRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: DropInApiResponse) => {
        if (cancelled) return
        setSessions(j.sessions)
        setDefaultRate(j.defaults?.defaultSessionRateCents ?? null)
      })
      .catch(() => {
        // Silent — the section renders its own empty state.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Adult / all-ages pickup only (the endpoint returns classes and youth too).
  const adultPickup = sessions.filter((s) => s.kind === "pickup" && s.audience !== "youth")

  return (
    <PickupFinderSection
      id="sessions"
      icon="🟢"
      title="Next two weeks"
      descriptor="Show up and play. No commitment."
      sessions={adultPickup}
      defaultSessionRateCents={defaultRate}
      loading={loading}
    />
  )
}
