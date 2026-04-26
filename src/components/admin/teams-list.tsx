"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Users2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Season {
  id: string
  name: string
}

interface Program {
  id: string
  name: string
}

interface Coach {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface Team {
  id: string
  seasonId: string
  name: string
  color: string | null
  coachUserId: string | null
  assistantCoachUserId: string | null
  maxRosterSize: number | null
  division: string | null
  createdAt: string
  season: Season | null
  program: Program | null
  rosterCount: number
}

interface TeamsListProps {
  seasons: (Season & { program: Program })[]
  coaches: Coach[]
}

export function TeamsList({ seasons, coaches }: TeamsListProps) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [filterSeasonId, setFilterSeasonId] = useState<string>("all")
  const [formData, setFormData] = useState({
    seasonId: "",
    name: "",
    color: "#3b82f6",
    coachUserId: "",
    assistantCoachUserId: "",
    maxRosterSize: 15,
    division: "",
  })

  useEffect(() => {
    fetchTeams()
  }, [filterSeasonId])

  async function fetchTeams() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterSeasonId !== "all") {
        params.set("seasonId", filterSeasonId)
      }
      const response = await fetch(`/api/admin/teams?${params}`)
      if (!response.ok) throw new Error("Failed to fetch teams")
      const data = await response.json()
      setTeams(data.teams)
    } catch (err) {
      setError("Failed to load teams")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingTeam(null)
    setFormData({
      seasonId: seasons[0]?.id || "",
      name: "",
      color: "#3b82f6",
      coachUserId: "",
      assistantCoachUserId: "",
      maxRosterSize: 15,
      division: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(team: Team) {
    setEditingTeam(team)
    setFormData({
      seasonId: team.seasonId,
      name: team.name,
      color: team.color || "#3b82f6",
      coachUserId: team.coachUserId || "",
      assistantCoachUserId: team.assistantCoachUserId || "",
      maxRosterSize: team.maxRosterSize || 15,
      division: team.division || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/teams"
      const method = editingTeam ? "PUT" : "POST"
      const body = editingTeam
        ? {
            id: editingTeam.id,
            ...formData,
            coachUserId: formData.coachUserId || null,
            assistantCoachUserId: formData.assistantCoachUserId || null,
          }
        : {
            ...formData,
            coachUserId: formData.coachUserId || null,
            assistantCoachUserId: formData.assistantCoachUserId || null,
          }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save team")
      }

      await fetchTeams()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(team: Team) {
    const ok = await confirm({
      title: "Delete team?",
      description: <>Delete <strong>{team.name}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/teams?id=${team.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete team")
      }

      await fetchTeams()
      toast.success(`Deleted "${team.name}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete team")
    }
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
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teams</h1>
          <p className="text-gray-600 mt-1">Manage teams and rosters</p>
        </div>
        <Button onClick={openCreateDialog} disabled={seasons.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add Team
        </Button>
      </div>

      {seasons.length === 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              You need to create at least one season before adding teams.
            </p>
            <a href="/admin/seasons" className="text-primary hover:underline text-sm mt-2 inline-block">
              Go to Seasons &rarr;
            </a>
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

      {teams.length === 0 && seasons.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No teams found</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${team.color || "#3b82f6"}20`, color: team.color || "#3b82f6" }}
                    >
                      <Users2 className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                      <CardDescription>
                        {team.program?.name} - {team.season?.name}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {team.rosterCount} / {team.maxRosterSize || "∞"} players
                  </Badge>
                  {team.division && (
                    <Badge variant="secondary">{team.division}</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <a
                    href={`/admin/teams/${team.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Manage Roster &rarr;
                  </a>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(team)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Edit Team" : "Add Team"}</DialogTitle>
            <DialogDescription>
              {editingTeam ? "Update the team details" : "Create a new team for a season"}
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
                <Label htmlFor="seasonId">Season</Label>
                <Select
                  value={formData.seasonId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, seasonId: value }))}
                  disabled={!!editingTeam}
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

              <div className="space-y-2">
                <Label htmlFor="name">Team Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Red Dragons"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color">Team Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={formData.color}
                      onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxRosterSize">Max Roster Size</Label>
                  <Input
                    id="maxRosterSize"
                    type="number"
                    value={formData.maxRosterSize}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxRosterSize: parseInt(e.target.value) || 15 }))}
                    min={1}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="division">Division (optional)</Label>
                <Input
                  id="division"
                  value={formData.division}
                  onChange={(e) => setFormData((prev) => ({ ...prev, division: e.target.value }))}
                  placeholder="A, B, Gold, Silver, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coachUserId">Head Coach (optional)</Label>
                <Select
                  value={formData.coachUserId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, coachUserId: value === "none" ? "" : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a coach" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No coach assigned</SelectItem>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.firstName && coach.lastName
                          ? `${coach.firstName} ${coach.lastName}`
                          : coach.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assistantCoachUserId">Assistant Coach (optional)</Label>
                <Select
                  value={formData.assistantCoachUserId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, assistantCoachUserId: value === "none" ? "" : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an assistant coach" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No assistant coach</SelectItem>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.firstName && coach.lastName
                          ? `${coach.firstName} ${coach.lastName}`
                          : coach.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                ) : editingTeam ? (
                  "Update Team"
                ) : (
                  "Create Team"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
