"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorBanner } from "@/components/ui/error-banner"

/**
 * The read surface for forming-season interest (#543). Until this existed,
 * interest submissions were write-only — 16 real people with names and
 * emails were stored in prod and reachable by nobody. Lists every record
 * for the org, filterable by season; the CSV export is the "email the list
 * when the season opens" workflow until an automated notify ships.
 *
 * Deep-linkable: /admin/season-interest?seasonId=<uuid> (the /admin/seasons
 * "N interested" badges link here with their season pre-selected).
 */

interface InterestRecord {
  id: string
  email: string
  firstName: string | null
  createdAt: string
  seasonId: string
  seasonName: string
  seasonStatus: string
  termSlug: string | null
  termLabel: string | null
  programName: string
}

export function SeasonInterestList() {
  const [records, setRecords] = useState<InterestRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seasonFilter, setSeasonFilter] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return new URLSearchParams(window.location.search).get("seasonId") ?? ""
  })

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/season-interest")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load interest records")
        const data = await res.json()
        if (!cancelled) setRecords(data.interest)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load interest records")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // One entry per season that has records, for the filter row — ordered by
  // record count so the busiest divisions lead.
  const seasonOptions = useMemo(() => {
    const bySeason = new Map<string, { id: string; label: string; count: number }>()
    for (const r of records) {
      const existing = bySeason.get(r.seasonId)
      if (existing) existing.count += 1
      else bySeason.set(r.seasonId, { id: r.seasonId, label: r.seasonName, count: 1 })
    }
    return [...bySeason.values()].sort((a, b) => b.count - a.count)
  }, [records])

  const visible = useMemo(
    () => (seasonFilter ? records.filter((r) => r.seasonId === seasonFilter) : records),
    [records, seasonFilter],
  )

  const exportHref = seasonFilter
    ? `/api/admin/season-interest/export.csv?seasonId=${encodeURIComponent(seasonFilter)}`
    : "/api/admin/season-interest/export.csv"

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Season interest</h1>
          <p className="text-gray-600 mt-1">
            People who asked to hear when a forming season opens — export the list and email
            them the moment it does.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={exportHref} download>
            <Download className="h-4 w-4 mr-2" />
            Export CSV{seasonFilter ? " (filtered)" : ""}
          </a>
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {!error && records.length === 0 && (
        <EmptyState
          title="No interest yet"
          description="Records appear here the moment someone submits the interest form on a forming season."
        />
      )}

      {records.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={seasonFilter === "" ? "default" : "outline"}
              onClick={() => setSeasonFilter("")}
            >
              All ({records.length})
            </Button>
            {seasonOptions.map((o) => (
              <Button
                key={o.id}
                size="sm"
                variant={seasonFilter === o.id ? "default" : "outline"}
                onClick={() => setSeasonFilter(o.id)}
              >
                {o.label} ({o.count})
              </Button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {visible.length} {visible.length === 1 ? "person" : "people"} waiting
              </CardTitle>
              <CardDescription>
                Newest first. A season marked <Badge variant="outline">open</Badge> means these
                people should already have been told it opened.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th scope="col" className="py-2 pr-4 font-medium">Submitted</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Email</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Season</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Term</th>
                      <th scope="col" className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                        <td className="py-2 pr-4">{r.firstName ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <a className="underline underline-offset-2" href={`mailto:${r.email}`}>
                            {r.email}
                          </a>
                        </td>
                        <td className="py-2 pr-4">
                          {r.seasonName}
                          <span className="block text-xs text-muted-foreground">{r.programName}</span>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{r.termLabel ?? "—"}</td>
                        <td className="py-2">
                          <Badge variant={r.seasonStatus === "open" ? "default" : "outline"}>
                            {r.seasonStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
