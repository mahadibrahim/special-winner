"use client"

import { Users, ClipboardList, ClipboardCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface CoachTeam {
  teamId: string
  teamName: string
  playerCount: number
}

export function CoachTeams({ teams }: { teams: CoachTeam[] }) {
  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams assigned yet"
        description="Once you're assigned as a head or assistant coach, your teams show up here."
        icon={<Users className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Teams</h1>
        <p className="text-muted-foreground mt-1">Pick a team to manage its roster and attendance.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <Card key={t.teamId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{t.teamName}</CardTitle>
              <Badge variant="outline">{t.playerCount} players</Badge>
            </CardHeader>
            <CardContent className="flex gap-4 pt-2">
              <a
                href={`/coach/roster/${t.teamId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ClipboardList className="h-4 w-4" /> Roster
              </a>
              <a
                href={`/coach/attendance/${t.teamId}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ClipboardCheck className="h-4 w-4" /> Attendance
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
