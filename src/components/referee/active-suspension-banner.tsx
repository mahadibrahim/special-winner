"use client"

import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface ActiveSuspensionFlagData {
  id: string
  personName: string
  teamId: string
  status: "active" | "served" | "appealed" | "season" | "permanent"
  gamesMissed: number
  gamesServed: number
  escalatedToDirector: boolean
}

const SEVERITY_LABEL: Record<string, string> = {
  permanent: "Permanent",
  season: "Season",
  active: "Active",
}
const SEVERITY_STYLE: Record<string, string> = {
  permanent: "bg-red-100 text-red-800 border-red-300",
  season: "bg-orange-100 text-orange-800 border-orange-300",
  active: "bg-yellow-100 text-yellow-800 border-yellow-300",
}

/**
 * Team-level flag surfaced to the assigned referee: "active suspension on
 * these rosters — verify" (per the ejection-tracker plan). No per-person
 * auto-matching in v1 — the ref cross-checks against the actual lineup.
 */
export function ActiveSuspensionBanner({
  suspensions,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
}: {
  suspensions: ActiveSuspensionFlagData[]
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeamName: string | null
  awayTeamName: string | null
}) {
  if (suspensions.length === 0) return null

  const teamLabel = (teamId: string) => {
    if (teamId === homeTeamId) return homeTeamName ?? "Home"
    if (teamId === awayTeamId) return awayTeamName ?? "Away"
    return "Unknown team"
  }

  return (
    <Card className="border-amber-400">
      <CardHeader className="flex flex-row items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
        <CardTitle className="text-base">
          Active suspension{suspensions.length > 1 ? "s" : ""} on these rosters — verify
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {suspensions.map((s) => {
          const remaining = Math.max(s.gamesMissed - s.gamesServed, 0)
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[s.status] ?? ""}`}
              >
                {SEVERITY_LABEL[s.status] ?? s.status}
              </span>
              <span className="font-medium">{s.personName}</span>
              <span className="text-muted-foreground">({teamLabel(s.teamId)})</span>
              <span className="text-muted-foreground">
                {remaining} game{remaining === 1 ? "" : "s"} remaining
              </span>
              {s.escalatedToDirector && (
                <span className="text-xs font-medium text-amber-700">Escalated to director</span>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
