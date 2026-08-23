"use client"

import { useState, useEffect } from "react"
import { Loader2, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RevenueData {
  summary: {
    totalRevenue: number
    transactionCount: number
    revenueChange: number
    refunds: {
      total: number
      count: number
    }
  }
  revenueByPeriod: Array<{
    period: string
    revenue: number
    transactionCount: number
  }>
  revenueByType: Array<{
    paymentType: string
    revenue: number
    count: number
  }>
  revenueBySport: Array<{
    sportId: string
    sportName: string
    revenue: number
    registrations: number
  }>
  recentTransactions: Array<{
    id: string
    amountCents: number
    paymentType: string
    status: string
    createdAt: string
  }>
}

export function RevenueReport() {
  const [data, setData] = useState<RevenueData | null>(null)
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

      const response = await fetch(`/api/admin/reports/revenue?${params}`)
      if (!response.ok) throw new Error("Failed to fetch revenue data")
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

  function getPaymentTypeLabel(type: string) {
    const labels: Record<string, string> = {
      full: "Full Payment",
      deposit: "Deposit",
      balance: "Balance",
      installment: "Installment",
      refund: "Refund",
      membership: "Membership",
    }
    return labels[type] || type
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  const maxRevenue = Math.max(...data.revenueByPeriod.map((p) => p.revenue))
  // Revenue by Sport has no membership row (memberships aren't sport-scoped),
  // so its percentages are computed against the sum of the sport rows
  // themselves rather than data.summary.totalRevenue — otherwise, now that
  // the summary total includes membership revenue, the sport percentages
  // would under-sum and read as unaccounted-for revenue.
  const totalSportRevenue = data.revenueBySport.reduce((sum, s) => sum + s.revenue, 0)

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
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.totalRevenue)}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {data.summary.revenueChange >= 0 ? (
                <>
                  <ArrowUpRight className="h-3 w-3 text-green-600 mr-1" />
                  <span className="text-green-600">+{data.summary.revenueChange}%</span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-3 w-3 text-red-600 mr-1" />
                  <span className="text-red-600">{data.summary.revenueChange}%</span>
                </>
              )}
              <span className="ml-1">vs previous period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.transactionCount}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatCurrency(data.summary.totalRevenue / (data.summary.transactionCount || 1))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Refunds</CardTitle>
            <RefreshCcw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary.refunds.total)}</div>
            <p className="text-xs text-muted-foreground">{data.summary.refunds.count} refunds processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.summary.totalRevenue - data.summary.refunds.total)}
            </div>
            <p className="text-xs text-muted-foreground">After refunds</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart (simple bar chart using CSS) */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Over Time</CardTitle>
          <CardDescription>Revenue trends by {groupBy}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.revenueByPeriod.map((period) => (
              <div key={period.period} className="flex items-center gap-4">
                <div className="w-20 text-sm text-muted-foreground font-mono">{period.period}</div>
                <div className="flex-1">
                  <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${maxRevenue > 0 ? (period.revenue / maxRevenue) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-sm font-medium text-right">{formatCurrency(period.revenue)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Sport */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Sport</CardTitle>
            <CardDescription>Top performing sports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.revenueBySport.map((sport) => (
                <div key={sport.sportId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{sport.sportName}</p>
                    <p className="text-sm text-muted-foreground">{sport.registrations} registrations</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(sport.revenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {totalSportRevenue > 0
                        ? Math.round((sport.revenue / totalSportRevenue) * 100)
                        : 0}
                      % of total
                    </p>
                  </div>
                </div>
              ))}
              {data.revenueBySport.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Payment Type */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Payment Type</CardTitle>
            <CardDescription>Breakdown by payment method</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.revenueByType.map((type) => (
                <div key={type.paymentType} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{getPaymentTypeLabel(type.paymentType)}</Badge>
                    <span className="text-sm text-muted-foreground">({type.count})</span>
                  </div>
                  <span className="font-medium">{formatCurrency(type.revenue)}</span>
                </div>
              ))}
              {data.revenueByType.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Latest successful payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{formatCurrency(tx.amountCents)}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(tx.createdAt)}</p>
                </div>
                <Badge variant="outline">{getPaymentTypeLabel(tx.paymentType)}</Badge>
              </div>
            ))}
            {data.recentTransactions.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No recent transactions</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
