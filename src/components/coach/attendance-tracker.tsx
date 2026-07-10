"use client"

import { useState, useEffect } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import {
  Loader2,
  Check,
  X,
  Clock,
  AlertCircle,
  Save,
  CalendarDays,
  Users,
} from "lucide-react"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface RosterEntry {
  id: string
  jerseyNumber: string | null
  position: string | null
  status: string
  familyMember: {
    id: string
    firstName: string
    lastName: string
  }
}

interface AttendanceRecord {
  id: string
  rosterId: string
  gameId: string | null
  eventDate: string
  eventType: string
  status: string
  notes: string | null
}

interface AttendanceStats {
  rosterId: string
  totalPresent: number
  totalAbsent: number
  totalLate: number
  totalExcused: number
  totalRecords: number
}

interface Team {
  id: string
  name: string
}

interface Game {
  id: string
  scheduledAt: string
  status: string
}

interface AttendanceTrackerProps {
  teamId: string
}

type AttendanceStatus = "present" | "absent" | "late" | "excused"

export function AttendanceTracker({ teamId }: AttendanceTrackerProps) {
  useHydrationBeacon()

  const [team, setTeam] = useState<Team | null>(null)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState<AttendanceStats[]>([])
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form state
  const [eventDate, setEventDate] = useState(() => {
    const now = new Date()
    return now.toISOString().slice(0, 16)
  })
  const [eventType, setEventType] = useState<"practice" | "game" | "other">("practice")
  const [selectedGame, setSelectedGame] = useState<string>("")
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: AttendanceStatus; notes: string }>>({})

  useEffect(() => {
    fetchAttendanceData()
  }, [teamId])

  useEffect(() => {
    // Initialize attendance data when roster loads
    const initialData: Record<string, { status: AttendanceStatus; notes: string }> = {}
    roster.forEach((player) => {
      initialData[player.id] = { status: "present", notes: "" }
    })
    setAttendanceData(initialData)
  }, [roster])

  async function fetchAttendanceData() {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(`/api/coach/attendance?teamId=${teamId}`)
      if (!response.ok) throw new Error("Failed to fetch attendance data")
      const data = await response.json()
      setTeam(data.team)
      setRoster(data.roster)
      setAttendanceRecords(data.attendance)
      setStats(data.stats)
      setUpcomingGames(data.upcomingGames)
    } catch (err) {
      console.error(err)
      setLoadError("Could not load the roster and attendance records. Check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSaveAttendance() {
    setIsSaving(true)
    try {
      const records = Object.entries(attendanceData).map(([rosterId, data]) => ({
        rosterId,
        status: data.status,
        notes: data.notes || null,
      }))

      const response = await fetch("/api/coach/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          eventDate: new Date(eventDate).toISOString(),
          eventType,
          gameId: eventType === "game" ? selectedGame : null,
          records,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save attendance")
      }

      await fetchAttendanceData()
      toast.success("Attendance saved successfully")
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save attendance")
    } finally {
      setIsSaving(false)
    }
  }

  function updatePlayerAttendance(rosterId: string, status: AttendanceStatus) {
    setAttendanceData((prev) => ({
      ...prev,
      [rosterId]: { ...prev[rosterId], status },
    }))
  }

  function getStatusIcon(status: AttendanceStatus) {
    switch (status) {
      case "present":
        return <Check className="h-5 w-5 text-sage" />
      case "absent":
        return <X className="h-5 w-5 text-destructive" />
      case "late":
        return <Clock className="h-5 w-5 text-ochre" />
      case "excused":
        return <AlertCircle className="h-5 w-5 text-navy" />
    }
  }

  function getStatusBadge(status: AttendanceStatus) {
    const colors: Record<AttendanceStatus, string> = {
      present: "bg-sage/15 text-sage",
      absent: "bg-destructive/10 text-destructive",
      late: "bg-ochre/20 text-ochre",
      excused: "bg-navy/10 text-navy",
    }
    return colors[status]
  }

  function getPlayerStats(rosterId: string) {
    const playerStats = stats.find((s) => s.rosterId === rosterId)
    if (!playerStats || playerStats.totalRecords === 0) return null
    const rate = Math.round(
      ((playerStats.totalPresent + playerStats.totalLate) / playerStats.totalRecords) * 100
    )
    return { ...playerStats, rate }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-ink">Attendance Tracker</h1>
        <div className="space-y-3 max-w-lg">
          <ErrorBanner message={loadError} />
          <Button variant="outline" onClick={fetchAttendanceData}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Attendance Tracker</h1>
        <p className="text-ink-muted mt-1">
          {team?.name} - Track player attendance for practices and games
        </p>
      </div>

      {/* Take Attendance Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Take Attendance
          </CardTitle>
          <CardDescription>Record attendance for today's event</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventDate">Date & Time</Label>
              <Input
                id="eventDate"
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select
                value={eventType}
                onValueChange={(value) => setEventType(value as "practice" | "game" | "other")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="practice">Practice</SelectItem>
                  <SelectItem value="game">Game</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {eventType === "game" && upcomingGames.length > 0 && (
              <div className="space-y-2">
                <Label>Select Game</Label>
                <Select value={selectedGame} onValueChange={setSelectedGame}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a game" />
                  </SelectTrigger>
                  <SelectContent>
                    {upcomingGames.map((game) => (
                      <SelectItem key={game.id} value={game.id}>
                        {formatDate(game.scheduledAt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {roster.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2" />
              <p>No players on the roster yet</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Attendance Rate</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((player) => {
                    const playerStats = getPlayerStats(player.id)
                    const currentStatus = attendanceData[player.id]?.status || "present"
                    return (
                      <TableRow key={player.id}>
                        <TableCell className="font-mono">
                          {player.jerseyNumber || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {player.familyMember.firstName} {player.familyMember.lastName}
                          </div>
                          {player.position && (
                            <div className="text-xs text-muted-foreground">
                              {player.position}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {playerStats ? (
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-cream-3 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-sage rounded-full"
                                  style={{ width: `${playerStats.rate}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {playerStats.rate}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No data</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map(
                              (status) => (
                                <Button
                                  key={status}
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-11 w-11 p-0",
                                    currentStatus === status && getStatusBadge(status)
                                  )}
                                  onClick={() => updatePlayerAttendance(player.id, status)}
                                  title={status.charAt(0).toUpperCase() + status.slice(1)}
                                >
                                  {getStatusIcon(status)}
                                </Button>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex justify-end">
                <Button onClick={handleSaveAttendance} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Attendance
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Summary</CardTitle>
          <CardDescription>Overall attendance statistics for the team</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No attendance records yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Excused</TableHead>
                  <TableHead className="text-center">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((player) => {
                  const playerStats = getPlayerStats(player.id)
                  if (!playerStats) return null
                  return (
                    <TableRow key={player.id}>
                      <TableCell className="font-medium">
                        {player.familyMember.firstName} {player.familyMember.lastName}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-sage/10 text-sage">
                          {playerStats.totalPresent}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-destructive/5 text-destructive">
                          {playerStats.totalAbsent}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-ochre/10 text-ochre">
                          {playerStats.totalLate}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-navy/5 text-navy">
                          {playerStats.totalExcused}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {playerStats.rate}%
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
