"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"

interface RefereeRow {
  refereeUserId: string
  name: string
  count: number
  avgOverall: number
  avgGameControl: number
  avgCommunication: number
  avgFairness: number
  leagueCount: number
  tournamentCount: number
  lowSample: boolean
}

interface ReportData {
  referees: RefereeRow[]
  recentComments: Array<{
    comment: string
    overall: number
    gameType: string | null
    eventLabel: string | null
    createdAt: string
  }>
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function RefereeRatingsReport() {
  const [data, setData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/reports/referee-ratings")
      if (!res.ok) throw new Error("Failed to load referee ratings")
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load referee ratings")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Referee ratings</h1>
        <p className="text-gray-600 mt-1">
          Last 180 days. Ratings are anonymous — raters are never shown.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By referee</CardTitle>
          <CardDescription>Sorted by number of ratings received</CardDescription>
        </CardHeader>
        <CardContent>
          {data.referees.length === 0 ? (
            <EmptyState
              title="No ratings yet"
              description="Ratings appear once parents respond to post-game asks."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-4">Referee</th>
                    <th className="py-1 pr-4">Ratings</th>
                    <th className="py-1 pr-4">Overall</th>
                    <th className="py-1 pr-4">Game control</th>
                    <th className="py-1 pr-4">Communication</th>
                    <th className="py-1 pr-4">Fairness</th>
                    <th className="py-1">League / Tourn.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referees.map((r) => (
                    <tr key={r.refereeUserId} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {r.name}
                        {r.lowSample && (
                          <Badge
                            className="ml-2 bg-amber-100 text-amber-800"
                            title="Fewer than 5 ratings — treat the averages as anecdotal"
                          >
                            low sample
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4">{r.count}</td>
                      <td className="py-2 pr-4">{r.avgOverall}</td>
                      <td className="py-2 pr-4">{r.avgGameControl}</td>
                      <td className="py-2 pr-4">{r.avgCommunication}</td>
                      <td className="py-2 pr-4">{r.avgFairness}</td>
                      <td className="py-2">
                        {r.leagueCount} / {r.tournamentCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent comments (anonymous)</CardTitle>
          <CardDescription>Free-text comments left with ratings</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentComments.length === 0 ? (
            <EmptyState title="No comments yet" description="Free-text comments show up here." />
          ) : (
            <div className="space-y-4">
              {data.recentComments.map((c, i) => (
                <div key={i} className="border-b pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-100 text-gray-700">{c.overall}/5</Badge>
                    {c.eventLabel && (
                      <span className="text-sm text-muted-foreground">{c.eventLabel}</span>
                    )}
                    {c.gameType && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                        {c.gameType}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
