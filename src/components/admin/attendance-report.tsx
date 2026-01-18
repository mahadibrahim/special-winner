"use client"

import { useState, useEffect } from "react"
import { Loader2, Users, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AttendanceData {
  summary: {
    totalRecords: number
    present: number
    absent: number
    late: number
    excused: number
    attendanceRate: number
  }
  attendanceByPeriod: Array<{
    period: string
    totalRecords: number
    present: number
    absent: number
    late: number
    excused: number
  }>
  attendanceByEventType: Array<{
    eventType: string
    totalRecords: number
    present: number
    absent: number
    late: number
    excused: number
  }>
  attendanceByTeam: Array<{
    teamId: string
    teamName: string
    totalRecords: number
    present: number
    absent: number
    attendanceRate: number
  }>
  lowAttendancePlayers: Array<{
    rosterId: string
    playerName: string
    teamName: string
    totalRecords: number
    present: number
    absent: number
    attendanceRate: number
  }>
  recentEvents: Array<{
    id: string
    teamName: string
    eventDate: string
    eventType: string
    status: string
    playerName: string
  }>
  teamsList: Array<{
    id: string
    name: string
  }>
}

export function AttendanceReport() {
  const [data, setData] = useState<AttendanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("3")
  const [groupBy, setGroupBy] = useState("week")
  const [teamId, setTeamId] = useState("all")

  useEffect(() => {
    fetchData()
  }, [timeRange, groupBy, teamId])

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

      if (teamId !== "all") {
        params.set("teamId", teamId)
      }

      const response = await fetch(`/api/admin/reports/attendance?${params}`)
      if (!response.ok) throw new Error("Failed to fetch attendance data")
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function getEventTypeLabel(type: string) {
    const labels: Record<string, string> = {
      practice: "Practice",
      game: "Game",
      other: "Other",
    }
    return labels[type] || type
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "present":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Present</Badge>
      case "absent":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Absent</Badge>
      case "late":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Late</Badge>
      case "excused":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Excused</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) return null

  const maxRecords = Math.max(...data.attendanceByPeriod.map((p) => p.totalRecords), 1)

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
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
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {data.teamsList.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.attendanceRate}%</div>
            <p className="text-xs text-muted-foreground">{data.summary.totalRecords} total records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.summary.present}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.totalRecords > 0
                ? Math.round((data.summary.present / data.summary.totalRecords) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data.summary.absent}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.totalRecords > 0
                ? Math.round((data.summary.absent / data.summary.totalRecords) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{data.summary.late}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.totalRecords > 0
                ? Math.round((data.summary.late / data.summary.totalRecords) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Excused</CardTitle>
            <AlertTriangle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{data.summary.excused}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.totalRecords > 0
                ? Math.round((data.summary.excused / data.summary.totalRecords) * 100)
                : 0}
              % of total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Over Time</CardTitle>
          <CardDescription>Attendance trends by {groupBy}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.attendanceByPeriod.length > 0 ? (
            <div className="space-y-2">
              {data.attendanceByPeriod.map((period) => {
                const rate = period.totalRecords > 0
                  ? Math.round(((period.present + period.late) / period.totalRecords) * 100)
                  : 0
                return (
                  <div key={period.period} className="flex items-center gap-4">
                    <div className="w-20 text-sm text-muted-foreground font-mono">{period.period}</div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(period.present / maxRecords) * 100}%` }}
                          title={`Present: ${period.present}`}
                        />
                        <div
                          className="h-full bg-yellow-500 transition-all"
                          style={{ width: `${(period.late / maxRecords) * 100}%` }}
                          title={`Late: ${period.late}`}
                        />
                        <div
                          className="h-full bg-red-500 transition-all"
                          style={{ width: `${(period.absent / maxRecords) * 100}%` }}
                          title={`Absent: ${period.absent}`}
                        />
                        <div
                          className="h-full bg-blue-400 transition-all"
                          style={{ width: `${(period.excused / maxRecords) * 100}%` }}
                          title={`Excused: ${period.excused}`}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-sm font-medium text-right">{rate}%</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No attendance data available</p>
          )}
          <div className="flex items-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded" />
              <span>Late</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-400 rounded" />
              <span>Excused</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance by Team */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Team</CardTitle>
            <CardDescription>Team-level attendance rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.attendanceByTeam.map((team) => (
                <div key={team.teamId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{team.teamName}</p>
                    <p className="text-sm text-muted-foreground">{team.totalRecords} records</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${team.attendanceRate >= 80 ? "text-green-600" : team.attendanceRate >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                      {team.attendanceRate}%
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {team.present} present / {team.absent} absent
                    </p>
                  </div>
                </div>
              ))}
              {data.attendanceByTeam.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attendance by Event Type */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Event Type</CardTitle>
            <CardDescription>Breakdown by practices, games, and other events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.attendanceByEventType.map((eventType) => {
                const rate = eventType.totalRecords > 0
                  ? Math.round(((eventType.present + eventType.late) / eventType.totalRecords) * 100)
                  : 0
                return (
                  <div key={eventType.eventType} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getEventTypeLabel(eventType.eventType)}</Badge>
                      <span className="text-sm text-muted-foreground">({eventType.totalRecords} records)</span>
                    </div>
                    <span className={`font-medium ${rate >= 80 ? "text-green-600" : rate >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                      {rate}%
                    </span>
                  </div>
                )
              })}
              {data.attendanceByEventType.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Attendance Players */}
      {data.lowAttendancePlayers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Players with Low Attendance
            </CardTitle>
            <CardDescription>Players with less than 70% attendance rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.lowAttendancePlayers.map((player) => (
                <div key={player.rosterId} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{player.playerName}</p>
                    <p className="text-sm text-muted-foreground">{player.teamName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-red-600">{player.attendanceRate}%</p>
                    <p className="text-sm text-muted-foreground">
                      {player.present} present / {player.absent} absent
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance Records</CardTitle>
          <CardDescription>Latest attendance entries</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.recentEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium">{event.playerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {event.teamName} - {getEventTypeLabel(event.eventType)} - {formatDate(event.eventDate)}
                  </p>
                </div>
                {getStatusBadge(event.status)}
              </div>
            ))}
            {data.recentEvents.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No recent attendance records</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
