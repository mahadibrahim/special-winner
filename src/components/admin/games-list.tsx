"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Calendar, MapPin, Clock, UserCheck } from "lucide-react"
import { GameOfficialsDialog } from "./game-officials-dialog"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { groupSpacesByLocation } from "@/lib/admin/group-spaces"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Season {
  id: string
  name: string
  program: { id: string; name: string }
}

interface Team {
  id: string
  name: string
  seasonId: string
  color: string | null
}

interface Venue {
  id: string
  name: string
  location?: { name: string } | null
}

interface Game {
  id: string
  seasonId: string
  homeTeamId: string | null
  awayTeamId: string | null
  venueId: string | null
  fieldNumber: string | null
  scheduledAt: string
  durationMinutes: number | null
  status: string
  homeScore: number | null
  awayScore: number | null
  homeTeam: Team | null
  awayTeam: Team | null
  venue: Venue | null
  season: Season | null
}

interface GamesListProps {
  seasons: Season[]
  teams: Team[]
  venues: Venue[]
}

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  postponed: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-800",
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  postponed: "Postponed",
  cancelled: "Cancelled",
}

function alertConflict(warning: string) {
  toast.warning("Schedule conflict", { description: warning, duration: 10000 })
}

export function GamesList({ seasons, teams, venues }: GamesListProps) {
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [filterSeasonId, setFilterSeasonId] = useState<string>("all")
  const [error, setError] = useState<string | null>(null)
  // Game whose referee assignments are being managed (null = closed).
  const [officialsGame, setOfficialsGame] = useState<Game | null>(null)

  const [formData, setFormData] = useState({
    seasonId: "",
    homeTeamId: "",
    awayTeamId: "",
    venueId: "",
    fieldNumber: "",
    scheduledAt: "",
    durationMinutes: 60,
    status: "scheduled",
    homeScore: "",
    awayScore: "",
  })

  // Filter teams by selected season
  const filteredTeams = teams.filter(
    t => formData.seasonId === "" || t.seasonId === formData.seasonId
  )

  useEffect(() => {
    fetchGames()
  }, [filterSeasonId])

  async function fetchGames() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSeasonId !== "all") {
        params.set("seasonId", filterSeasonId)
      }
      const response = await fetch(`/api/admin/games?${params}`)
      if (!response.ok) throw new Error("Failed to fetch games")
      const data = await response.json()
      setGames(data.games)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingGame(null)
    const now = new Date()
    now.setMinutes(0)
    now.setSeconds(0)
    now.setHours(now.getHours() + 1)

    setFormData({
      seasonId: seasons[0]?.id || "",
      homeTeamId: "",
      awayTeamId: "",
      venueId: "",
      fieldNumber: "",
      scheduledAt: now.toISOString().slice(0, 16),
      durationMinutes: 60,
      status: "scheduled",
      homeScore: "",
      awayScore: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(game: Game) {
    setEditingGame(game)
    setFormData({
      seasonId: game.seasonId,
      homeTeamId: game.homeTeamId || "",
      awayTeamId: game.awayTeamId || "",
      venueId: game.venueId || "",
      fieldNumber: game.fieldNumber || "",
      scheduledAt: new Date(game.scheduledAt).toISOString().slice(0, 16),
      durationMinutes: game.durationMinutes || 60,
      status: game.status,
      homeScore: game.homeScore?.toString() || "",
      awayScore: game.awayScore?.toString() || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/games"
      const method = editingGame ? "PUT" : "POST"
      const body = {
        ...(editingGame ? { id: editingGame.id } : {}),
        seasonId: formData.seasonId,
        homeTeamId: formData.homeTeamId || null,
        awayTeamId: formData.awayTeamId || null,
        venueId: formData.venueId || null,
        fieldNumber: formData.fieldNumber || null,
        scheduledAt: new Date(formData.scheduledAt).toISOString(),
        durationMinutes: formData.durationMinutes || null,
        status: formData.status,
        homeScore: formData.homeScore ? parseInt(formData.homeScore) : null,
        awayScore: formData.awayScore ? parseInt(formData.awayScore) : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (response.status === 409 && data.warning) {
        // Saved, but the slot conflicts in the field-time ledger (another
        // game, a rental, or an external hold). Keep the row, surface the
        // blocking label, let the admin move it.
        await fetchGames()
        setIsDialogOpen(false)
        setError(null)
        alertConflict(data.warning)
        return
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to save game")
      }

      await fetchGames()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(game: Game) {
    const gameDesc = game.homeTeam && game.awayTeam
      ? `${game.homeTeam.name} vs ${game.awayTeam.name}`
      : "this game"
    if (!confirm(`Are you sure you want to delete ${gameDesc}?`)) return

    try {
      const response = await fetch(`/api/admin/games?id=${game.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete game")
      }

      await fetchGames()
    } catch (err: any) {
      alert(err.message)
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Games</h1>
          <p className="text-gray-600 mt-1">
            Cross-season summary. Schedule games from a season's Schedule tab.
          </p>
        </div>
        <a
          href="/admin/seasons"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-cream"
        >
          Open a season →
        </a>
      </div>

      {seasons.length === 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              You need to create seasons and teams before scheduling games.
            </p>
          </CardContent>
        </Card>
      )}

      {seasons.length > 0 && (
        <div className="flex items-center gap-4">
          <Label className="whitespace-nowrap">Filter by Season:</Label>
          <Select value={filterSeasonId} onValueChange={setFilterSeasonId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All seasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Seasons</SelectItem>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id}>
                  {season.program.name} - {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {games.length === 0 && seasons.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No games scheduled</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule First Game
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {games.map((game) => (
            <Card key={game.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    {/* Date/Time */}
                    <div className="text-center min-w-[140px]">
                      <p className="text-sm text-muted-foreground">
                        {formatDate(game.scheduledAt)}
                      </p>
                      {game.durationMinutes && (
                        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" />
                          {game.durationMinutes} min
                        </p>
                      )}
                    </div>

                    {/* Teams */}
                    <div className="flex items-center gap-4">
                      <div className="text-right min-w-[100px]">
                        <p className="font-medium">
                          {game.homeTeam?.name || "TBD"}
                        </p>
                        {game.status === "completed" && (
                          <p className="text-2xl font-bold">{game.homeScore ?? "-"}</p>
                        )}
                      </div>
                      <span className="text-muted-foreground font-medium">vs</span>
                      <div className="text-left min-w-[100px]">
                        <p className="font-medium">
                          {game.awayTeam?.name || "TBD"}
                        </p>
                        {game.status === "completed" && (
                          <p className="text-2xl font-bold">{game.awayScore ?? "-"}</p>
                        )}
                      </div>
                    </div>

                    {/* Space */}
                    {game.venue && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {game.venue.name}
                        {game.fieldNumber && ` - Field ${game.fieldNumber}`}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[game.status]}>
                      {statusLabels[game.status]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOfficialsGame(game)}
                      title="Manage referees"
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Refs
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(game)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(game)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Game Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGame ? "Edit Game" : "Schedule Game"}</DialogTitle>
            <DialogDescription>
              {editingGame ? "Update game details" : "Schedule a new game"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Season</Label>
                <Select
                  value={formData.seasonId}
                  onValueChange={(value) => setFormData((prev) => ({
                    ...prev,
                    seasonId: value,
                    homeTeamId: "",
                    awayTeamId: ""
                  }))}
                  disabled={!!editingGame}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a season" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        {season.program.name} - {season.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Home Team</Label>
                  <Select
                    value={formData.homeTeamId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, homeTeamId: value === "none" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">TBD</SelectItem>
                      {filteredTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Away Team</Label>
                  <Select
                    value={formData.awayTeamId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, awayTeamId: value === "none" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">TBD</SelectItem>
                      {filteredTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, durationMinutes: parseInt(e.target.value) || 60 }))}
                    min={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Space</Label>
                  <Select
                    value={formData.venueId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, venueId: value === "none" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a space" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No space</SelectItem>
                      {groupSpacesByLocation(venues).map((group) => (
                        <SelectGroup key={group.locationName}>
                          <SelectLabel>{group.locationName}</SelectLabel>
                          {group.spaces.map((venue) => (
                            <SelectItem key={venue.id} value={venue.id}>
                              {venue.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Field Number (optional)</Label>
                  <Input
                    value={formData.fieldNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, fieldNumber: e.target.value }))}
                    placeholder="1, A, etc."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="postponed">Postponed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.status === "completed" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Home Score</Label>
                    <Input
                      type="number"
                      value={formData.homeScore}
                      onChange={(e) => setFormData((prev) => ({ ...prev, homeScore: e.target.value }))}
                      min={0}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Away Score</Label>
                    <Input
                      type="number"
                      value={formData.awayScore}
                      onChange={(e) => setFormData((prev) => ({ ...prev, awayScore: e.target.value }))}
                      min={0}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingGame ? (
                  "Update Game"
                ) : (
                  "Schedule Game"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Referee assignment dialog */}
      <GameOfficialsDialog
        gameId={officialsGame?.id ?? null}
        gameLabel={
          officialsGame
            ? `${officialsGame.homeTeam?.name ?? "TBD"} vs ${officialsGame.awayTeam?.name ?? "TBD"}`
            : ""
        }
        onClose={() => setOfficialsGame(null)}
      />
    </div>
  )
}
