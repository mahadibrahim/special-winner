"use client"

import { useState, useEffect } from "react"
import { ClipboardList } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface RosterPlayer {
  playerName: string
  status: string
  jerseyNumber: string | null
}

interface RosterTeam {
  teamId: string
  teamName: string
  players: RosterPlayer[]
}

export function VenueRosters() {
  useHydrationBeacon()
  const [teams, setTeams] = useState<RosterTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRosters() {
      try {
        const response = await fetch("/api/admin/venue/rosters")
        if (!response.ok) throw new Error("Failed to fetch rosters")
        const data = await response.json()
        setTeams(data.teams)
      } catch (err) {
        setError("Failed to load rosters")
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchRosters()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
    )
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams at your venue yet"
        description="Teams will appear here once rosters are assigned to programs at your location."
        icon={<ClipboardList className="h-10 w-10" />}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Rosters</h1>
        <p className="text-gray-600 mt-1">
          Player rosters for teams at your venue. Edit rosters via the super-admin team detail.
        </p>
      </div>

      <div className="space-y-4">
        {teams.map((team) => (
          <Card key={team.teamId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{team.teamName}</CardTitle>
                <Badge variant="outline">{team.players.length} players</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {team.players.length === 0 ? (
                <p className="text-sm text-muted-foreground">No players on this roster yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Name</th>
                      <th className="pb-2 font-medium w-20">Jersey</th>
                      <th className="pb-2 font-medium w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.players.map((player, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{player.playerName}</td>
                        <td className="py-2 text-muted-foreground">
                          {player.jerseyNumber ?? <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant={player.status === "active" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {player.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
