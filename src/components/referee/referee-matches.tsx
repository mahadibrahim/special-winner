"use client"

import { ClipboardList } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface RefereeMatch {
  gameId: string
  scheduledAt: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  reported: boolean
}

export function RefereeMatches({ matches }: { matches: RefereeMatch[] }) {
  useHydrationBeacon()

  if (matches.length === 0) {
    return (
      <EmptyState
        title="No assigned matches yet"
        description="Matches you're assigned to officiate will appear here."
        icon={<ClipboardList className="h-10 w-10" />}
      />
    )
  }
  const now = new Date()
  const toReport = matches.filter((m) => !m.reported && new Date(m.scheduledAt) < now)
  const upcoming = matches.filter((m) => !m.reported && new Date(m.scheduledAt) >= now)
  const completed = matches.filter((m) => m.reported)

  const renderCards = (list: RefereeMatch[]) =>
    list.map((m) => (
      <a key={m.gameId} href={`/referee/matches/${m.gameId}`} className="block">
        <Card className="transition-colors hover:border-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              {m.homeTeamName ?? "TBD"} vs {m.awayTeamName ?? "TBD"}
            </CardTitle>
            <Badge variant={m.reported ? "default" : "secondary"}>
              {m.reported ? `${m.homeScore}–${m.awayScore}` : "Report due"}
            </Badge>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">
            {new Date(m.scheduledAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </CardContent>
        </Card>
      </a>
    ))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My matches</h1>
        <p className="text-muted-foreground mt-1">Report the result for each match you officiate.</p>
      </div>
      {toReport.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">To report</h2>
          {renderCards(toReport)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          {renderCards(upcoming)}
        </div>
      )}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Completed</h2>
          {renderCards(completed)}
        </div>
      )}
    </div>
  )
}
