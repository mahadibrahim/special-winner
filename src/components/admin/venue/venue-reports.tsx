"use client"

import { useState, useEffect } from "react"
import { Users, UserCheck, UserX, CalendarCheck, BarChart3 } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Period = "today" | "week"

interface VenueReport {
  checkedIn: number
  walkUps: number
  noShows: number
  booked: number
  capacity: number
  fillRate: number
}

export function VenueReports() {
  useHydrationBeacon()

  const [period, setPeriod] = useState<Period>("today")
  const [report, setReport] = useState<VenueReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReport(period)
  }, [period])

  async function fetchReport(p: Period) {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/venue/reports?period=${p}`)
      if (!res.ok) throw new Error("Failed to load reports")
      const data = await res.json()
      setReport(data.report)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Operations Reports</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPeriod("today")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              period === "today"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPeriod("week")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              period === "week"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            Last 7 days
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSkeleton rows={2} variant="card" />
      ) : report ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Checked in</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.checkedIn}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Walk-ups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.walkUps}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No-shows</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.noShows}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booked</CardTitle>
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report.booked}</div>
              <p className="text-xs text-muted-foreground">of {report.capacity} capacity</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fill rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(report.fillRate * 100)}%</div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
