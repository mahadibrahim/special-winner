"use client"

import { useEffect, useState } from "react"
import { Loader2, Smile, Users, Percent, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { npsCategory } from "@/lib/feedback/constants"

interface NpsReportData {
  nps: number | null
  responseCount: number
  sentCount: number
  responseRate: number | null
  reviewClicks: number
  reviewUrlConfigured: boolean
  byKind: Array<{ kind: string; nps: number | null; count: number }>
  trend: Array<{ weekStart: string; nps: number | null; count: number }>
  recent: Array<{
    score: number
    comment: string | null
    kind: string
    eventLabel: string | null
    respondedAt: string
  }>
}

const KIND_LABELS: Record<string, string> = {
  nps_drop_in: "Drop-in / pickup",
  nps_field_rental: "Field rentals",
  nps_season: "Seasons",
}

function categoryBadgeClass(score: number): string {
  const category = npsCategory(score)
  if (category === "detractor") return "bg-red-100 text-red-800"
  if (category === "promoter") return "bg-green-100 text-green-800"
  return "bg-gray-100 text-gray-700"
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

export function NpsReport() {
  const [data, setData] = useState<NpsReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/reports/nps")
      if (!res.ok) throw new Error("Failed to load NPS report")
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load NPS report")
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
        <h1 className="text-3xl font-bold text-gray-900">NPS</h1>
        <p className="text-gray-600 mt-1">Rolling 90 days, all booking types</p>
      </div>

      {!data.reviewUrlConfigured && (
        <ErrorBanner message="No Google review URL is configured — promoters see a plain thank-you. Set one in Settings → Customer feedback." />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NPS</CardTitle>
            <Smile className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.nps === null ? "—" : data.nps}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Responses</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.responseCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.responseRate === null ? "—" : `${data.responseRate}%`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Review clicks</CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.reviewClicks}</div>
          </CardContent>
        </Card>
      </div>

      {/* By booking type */}
      <Card>
        <CardHeader>
          <CardTitle>By booking type</CardTitle>
          <CardDescription>NPS broken out by the kind of experience surveyed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.byKind.map((k) => (
              <div
                key={k.kind}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <span className="font-medium">{KIND_LABELS[k.kind] ?? k.kind}</span>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{k.nps === null ? "— NPS" : `${k.nps} NPS`}</span>
                  <span>{k.count} responses</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly trend */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly trend</CardTitle>
          <CardDescription>NPS by week of response</CardDescription>
        </CardHeader>
        <CardContent>
          {data.trend.length === 0 ? (
            <EmptyState
              title="No responses yet"
              description="Trend appears once surveys start coming back."
            />
          ) : (
            <div className="space-y-2">
              {data.trend.map((t) => (
                <div
                  key={t.weekStart}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span className="text-sm">{t.weekStart}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{t.nps === null ? "—" : t.nps}</span>
                    <span>{t.count} responses</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent responses */}
      <Card>
        <CardHeader>
          <CardTitle>Recent responses</CardTitle>
          <CardDescription>Detractors surface first</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <EmptyState
              title="No responses yet"
              description="Responses appear here as they come in."
            />
          ) : (
            <div className="space-y-4">
              {data.recent.map((r, i) => (
                <div key={i} className="border-b pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge className={categoryBadgeClass(r.score)}>{r.score}/10</Badge>
                    <span className="text-sm text-muted-foreground">
                      {r.eventLabel ?? KIND_LABELS[r.kind] ?? r.kind}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDate(r.respondedAt)}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
