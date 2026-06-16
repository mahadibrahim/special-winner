"use client"

import { ClipboardList } from "lucide-react"
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
  if (matches.length === 0) {
    return (
      <EmptyState
        title="No assigned matches yet"
        description="Matches you're assigned to officiate will appear here."
        icon={<ClipboardList className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My matches</h1>
        <p className="text-muted-foreground mt-1">Report the result for each match you officiate.</p>
      </div>
      <div className="space-y-3">
        {matches.map((m) => (
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
        ))}
      </div>
    </div>
  )
}
