"use client"

import { useEffect, useState } from "react"
import ProgramCardV2 from "@/components/programs/program-card-v2"
import { deriveAudience, type SeasonForDerive } from "@/lib/programs/derive"

interface ApiSeason extends SeasonForDerive {
  id: string
  name: string
  slug: string
  price: number
  teamPrice: number | null
  scheduleNotes: string | null
  status: string
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  location: { id: string; name: string; slug: string; city: string | null; state: string | null }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

const ROW_LIMIT = 6

export default function FeaturedProgramsRow({
  audience,
}: {
  audience: "youth" | "adult"
}) {
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
        // Silent — row hides itself if no data.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const matching = seasons
    .filter((s) => deriveAudience(s) === audience)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, ROW_LIMIT)

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-3 px-4 sm:px-6 lg:px-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-none w-[300px] h-[320px] bg-paper border border-border rounded-2xl animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  if (matching.length === 0) return null

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 px-4 sm:px-6 lg:px-8 snap-x snap-mandatory">
      {matching.map((s) => (
        <div key={s.id} className="flex-none w-[300px] sm:w-[320px] snap-start">
          <ProgramCardV2 season={s} />
        </div>
      ))}
    </div>
  )
}
