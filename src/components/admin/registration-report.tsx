"use client"

import { useState, useEffect } from "react"
import { Loader2, Users, UserCheck, UserX, Clock, ArrowUpRight, ArrowDownRight, Percent } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RegistrationData {
  summary: {
    totalRegistrations: number
    confirmedRegistrations: number
    pendingRegistrations: number
    cancelledRegistrations: number
    waitlistedRegistrations: number
    uniqueFamilies: number
    registrationChange: number
    conversionRate: number
  }
  registrationsByPeriod: Array<{
    period: string
    total: number
    confirmed: number
    pending: number
    cancelled: number
    waitlisted: number
  }>
  registrationsBySport: Array<{
    sportId: string
    sportName: string
    total: number
    confirmed: number
  }>
  registrationsByProgram: Array<{
    programId: string
    programName: string
    sportName: string
    total: number
    confirmed: number
  }>
  paymentStatusBreakdown: Array<{
    paymentStatus: string
    count: number
    totalAmountDue: number
    totalAmountPaid: number
  }>
  recentRegistrations: Array<{
    id: string
    status: string
    paymentStatus: string
    createdAt: string
    familyMember: {
      firstName: string
      lastName: string
    }
    season: {
      name: string
    }
    program: {
      name: string
    }
  }>
}

export function RegistrationReport() {
  const [data, setData] = useState<RegistrationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("12")
  const [groupBy, setGroupBy] = useState("month")

  useEffect(() => {
    fetchData()
  }, [timeRange, groupBy])

  async function fetchData() {
    setIsLoading(true)
    try {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - parseInt(timeRange))

      const params = new URLSearchParams({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        groupBy,
      })

      const response = await fetch(`/api/admin/reports/registrations?${params}`)
      if (!response.ok) throw new Error("Failed to fetch registration data")
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      confirmed: "bg-green-100 text-green-800",
      pending: "bg-yellow-100 text-yellow-800",
      waitlisted: "bg-blue-100 text-blue-800",
      cancelled: "bg-red-100 text-red-800",
      refunded: "bg-gray-100 text-gray-800",
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  function getPaymentStatusLabel(status: string) {
    const labels: Record<string, string> = {
      unpaid: "Unpaid",
      deposit_paid: "Deposit Paid",
      paid: "Paid",
      partial_refund: "Partial Refund",
      refunded: "Refunded",
      // Spot covered by a team registration's deposit/backstop — the money
      // lives on team-level payment rows, not in per-player amounts (#531).
      team_funded: "Team Funded",
    }
    return labels[status] || status
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  const maxRegistrations = Math.max(...data.registrationsByPeriod.map((p) => p.total))

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last Month</SelectItem>
            <SelectItem value="3">Last 3 Months</SelectItem>
            <SelectItem value="6">Last 6 Months</SelectItem>
            <SelectItem value="12">Last 12 Months</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalRegistrations}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {data.summary.registrationChange >= 0 ? (
                <>
                  <ArrowUpRight className="h-3 w-3 text-green-600 mr-1" />
                  <span className="text-green-600">+{data.summary.registrationChange}%</span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-3 w-3 text-red-600 mr-1" />
                  <span className="text-red-600">{data.summary.registrationChange}%</span>
                </>
              )}
              <span className="ml-1">vs previous period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.confirmedRegistrations}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.pendingRegistrations} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Confirmed / Total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Families</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.uniqueFamilies}</div>
            <p className="text-xs text-muted-foreground">
              Avg {(data.summary.totalRegistrations / (data.summary.uniqueFamilies || 1)).toFixed(1)} per family
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registration Chart (simple bar chart using CSS) */}
      <Card>
        <CardHeader>
          <CardTitle>Registrations Over Time</CardTitle>
          <CardDescription>Registration trends by {groupBy}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.registrationsByPeriod.map((period) => (
              <div key={period.period} className="flex items-center gap-4">
                <div className="w-20 text-sm text-muted-foreground font-mono">{period.period}</div>
                <div className="flex-1">
                  <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${maxRegistrations > 0 ? (period.confirmed / maxRegistrations) * 100 : 0}%` }}
                      title={`Confirmed: ${period.confirmed}`}
                    />
                    <div
                      className="h-full bg-yellow-500"
                      style={{ width: `${maxRegistrations > 0 ? (period.pending / maxRegistrations) * 100 : 0}%` }}
                      title={`Pending: ${period.pending}`}
                    />
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${maxRegistrations > 0 ? (period.waitlisted / maxRegistrations) * 100 : 0}%` }}
                      title={`Waitlisted: ${period.waitlisted}`}
                    />
                    <div
                      className="h-full bg-red-400"
                      style={{ width: `${maxRegistrations > 0 ? (period.cancelled / maxRegistrations) * 100 : 0}%` }}
                      title={`Cancelled: ${period.cancelled}`}
                    />
                  </div>
                </div>
                <div className="w-16 text-sm font-medium text-right">{period.total}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>Confirmed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded" />
              <span>Pending</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span>Waitlisted</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-400 rounded" />
              <span>Cancelled</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registrations by Sport */}
        <Card>
          <CardHeader>
            <CardTitle>Registrations by Sport</CardTitle>
            <CardDescription>Distribution across sports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.registrationsBySport.map((sport) => (
                <div key={sport.sportId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{sport.sportName}</p>
                    <p className="text-sm text-muted-foreground">
                      {sport.confirmed} confirmed of {sport.total}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{sport.total}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.summary.totalRegistrations > 0
                        ? Math.round((sport.total / data.summary.totalRegistrations) * 100)
                        : 0}
                      %
                    </p>
                  </div>
                </div>
              ))}
              {data.registrationsBySport.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Breakdown by payment state</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.paymentStatusBreakdown.map((status) => (
                <div key={status.paymentStatus} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{getPaymentStatusLabel(status.paymentStatus)}</Badge>
                    <span className="text-sm text-muted-foreground">({status.count})</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(status.totalAmountPaid)}</p>
                    <p className="text-xs text-muted-foreground">
                      of {formatCurrency(status.totalAmountDue)} due
                    </p>
                  </div>
                </div>
              ))}
              {data.paymentStatusBreakdown.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Programs */}
      <Card>
        <CardHeader>
          <CardTitle>Top Programs</CardTitle>
          <CardDescription>Most popular programs by registration count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.registrationsByProgram.map((program, index) => (
              <div key={program.programId} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                  <div>
                    <p className="font-medium">{program.programName}</p>
                    <p className="text-sm text-muted-foreground">{program.sportName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{program.total} registrations</p>
                  <p className="text-sm text-muted-foreground">{program.confirmed} confirmed</p>
                </div>
              </div>
            ))}
            {data.registrationsByProgram.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No data available</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Registrations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Registrations</CardTitle>
          <CardDescription>Latest registration activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.recentRegistrations.map((reg) => (
              <div key={reg.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">
                    {reg.familyMember.firstName} {reg.familyMember.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {reg.program.name} - {reg.season.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(reg.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={getStatusBadge(reg.status)}>{reg.status}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {getPaymentStatusLabel(reg.paymentStatus)}
                  </Badge>
                </div>
              </div>
            ))}
            {data.recentRegistrations.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No recent registrations</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
