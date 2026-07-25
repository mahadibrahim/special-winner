"use client"

import { useEffect, useState } from "react"
import { Users, ChevronRight, AlertCircle } from "lucide-react"

interface CaptainTeamSummary {
  id: string
  teamName: string
  seasonName: string
  teamFeeCents: number | null
  collectedCents: number
  unpaidCount: number
}

/**
 * Compact "teams you captain" card for the My Play dashboard. Self-gating: it
 * fetches the captain-scoped list and renders NOTHING when the user captains no
 * teams, so non-captains never see a "My Teams" surface. Full management lives
 * at /dashboard/teams/[id].
 */
export default function MyTeamsCard() {
  const [teams, setTeams] = useState<CaptainTeamSummary[] | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/dashboard/teams")
        if (!res.ok) return
        const json = (await res.json()) as { teams: CaptainTeamSummary[] }
        setTeams(json.teams)
      } catch {
        /* stay hidden on error — this is a secondary surface */
      }
    })()
  }, [])

  // Render nothing until loaded, and nothing at all for non-captains.
  if (!teams || teams.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Users className="w-4 h-4 text-ink-muted" />
          Teams you captain
        </h3>
        {teams.length > 1 && (
          <a href="/dashboard/teams" className="text-xs text-primary hover:underline">
            View all
          </a>
        )}
      </div>
      <div className="space-y-2">
        {teams.map((t) => (
          <a
            key={t.id}
            href={`/dashboard/teams/${t.id}`}
            className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-paper border border-border hover:border-primary/40 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{t.teamName}</p>
              <p className="text-xs text-ink-muted">{t.seasonName}</p>
              {t.unpaidCount > 0 && (
                <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  {t.unpaidCount} unpaid share{t.unpaidCount === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-ink-faint group-hover:text-primary transition-colors shrink-0" />
          </a>
        ))}
      </div>
    </div>
  )
}
