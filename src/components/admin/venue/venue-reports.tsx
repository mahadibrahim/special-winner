"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { Users, UserCheck, UserX, CalendarCheck, BarChart3 } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Period = "today" | "week"

interface VenueReport {
  checkedIn: number
  walkUps: number
  noShows: number
  booked: number
  capacity: number
  fillRate: number
}

/** One operations stat tile — collapses the five copy-pasted cards into one. */
function StatCard({
  title,
  icon,
  value,
  sub,
}: {
  title: string
  icon: ReactNode
  value: ReactNode
  sub?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  )
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
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Last 7 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && <ErrorBanner message={error} />}

      {isLoading ? (
        <LoadingSkeleton rows={2} variant="card" />
      ) : report ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Checked in"
            icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
            value={report.checkedIn}
          />
          <StatCard
            title="Walk-ups"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            value={report.walkUps}
          />
          <StatCard
            title="No-shows"
            icon={<UserX className="h-4 w-4 text-muted-foreground" />}
            value={report.noShows}
          />
          <StatCard
            title="Booked"
            icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />}
            value={report.booked}
            sub={`of ${report.capacity} capacity`}
          />
          <StatCard
            title="Fill rate"
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
            value={`${Math.round(report.fillRate * 100)}%`}
          />
        </div>
      ) : null}
    </div>
  )
}
