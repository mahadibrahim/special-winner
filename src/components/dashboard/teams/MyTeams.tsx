"use client"

import { useEffect, useState } from "react"
import { Users, ChevronRight, Loader2, AlertCircle } from "lucide-react"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface CaptainTeamSummary {
  id: string
  teamName: string
  seasonName: string
  seasonId: string
  status: string
  teamFeeCents: number | null
  depositCents: number
  collectedCents: number
  unpaidCount: number
  inviteeCount: number
  paymentDeadline: string | null
  createdAt: string | null
}

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—"
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export default function MyTeams() {
  useHydrationBeacon()
  const [teams, setTeams] = useState<CaptainTeamSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/dashboard/teams")
        if (!res.ok) throw new Error("load failed")
        const json = (await res.json()) as { teams: CaptainTeamSummary[] }
        setTeams(json.teams)
      } catch {
        setError("We couldn't load your teams. Please try again.")
      }
    })()
  }, [])

  if (error) return <ErrorBanner message={error} />

  if (!teams) {
    return (
      <div className="flex items-center gap-2 text-ink-muted py-16">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your teams…
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams yet"
        description="Teams you reserve as captain show up here, where you can invite teammates, track shares, and follow your schedule."
        icon={<Users className="w-8 h-8" />}
      />
    )
  }

  return (
    <div className="space-y-3">
      {teams.map((t) => {
        const pct =
          t.teamFeeCents && t.teamFeeCents > 0
            ? Math.min(100, Math.round((t.collectedCents / t.teamFeeCents) * 100))
            : 0
        return (
          <a
            key={t.id}
            href={`/dashboard/teams/${t.id}`}
            className="block p-5 rounded-2xl bg-paper border border-border hover:border-primary/40 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink truncate">{t.teamName}</h2>
                <p className="text-sm text-ink-muted mt-0.5">{t.seasonName}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-ink-faint group-hover:text-primary transition-colors shrink-0" />
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-1.5 text-sm">
                <span className="text-ink-muted">Collected</span>
                <span className="text-ink font-medium">
                  {fmtCents(t.collectedCents)}
                  {t.teamFeeCents != null && (
                    <span className="text-ink-muted font-normal"> / {fmtCents(t.teamFeeCents)}</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-cream-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {t.unpaidCount > 0 && (
              <p
                className={cn(
                  "flex items-center gap-1.5 mt-3 text-xs text-amber-600",
                )}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {t.unpaidCount} teammate{t.unpaidCount === 1 ? "" : "s"} still owe their share
              </p>
            )}
          </a>
        )
      })}
    </div>
  )
}
