"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, User, ArrowLeft } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
}

interface Registration {
  familyMember: FamilyMember
}

interface RosterEntry {
  id: string
  teamId: string
  registrationId: string
  jerseyNumber: string | null
  position: string | null
  status: string
  registration: Registration
}

interface Team {
  id: string
  name: string
  color: string | null
  maxRosterSize: number | null
  division: string | null
  season: {
    id: string
    name: string
    program: {
      id: string
      name: string
    }
  }
  coach?: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
  rosters: RosterEntry[]
}

interface AvailablePlayer {
  id: string
  lookingForTeam?: boolean
  familyMember: FamilyMember
}

interface RosterManagerProps {
  teamId: string
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  injured: "bg-red-100 text-red-800",
}

export function RosterManager({ teamId }: RosterManagerProps) {
  const [team, setTeam] = useState<Team | null>(null)
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRegistrationId, setSelectedRegistrationId] = useState("")
  const [jerseyNumber, setJerseyNumber] = useState("")
  const [position, setPosition] = useState("")
  const [freeAgentsOnly, setFreeAgentsOnly] = useState(false)

  useEffect(() => {
    fetchTeam()
    fetchAvailablePlayers()
  }, [teamId, freeAgentsOnly])

  async function fetchTeam() {
    try {
      const response = await fetch(`/api/admin/teams?id=${teamId}`)
      if (!response.ok) throw new Error("Failed to fetch team")
      const data = await response.json()
      setTeam(data.team)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchAvailablePlayers() {
    try {
      const params = new URLSearchParams({ teamId })
      if (freeAgentsOnly) params.set("freeAgents", "true")
      const response = await fetch(`/api/admin/rosters?${params}`)
      if (!response.ok) throw new Error("Failed to fetch available players")
      const data = await response.json()
      setAvailablePlayers(data.availablePlayers)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRegistrationId) return
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/admin/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          registrationId: selectedRegistrationId,
          jerseyNumber: jerseyNumber || null,
          position: position || null,
          status: "active",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to add player")
      }

      await fetchTeam()
      await fetchAvailablePlayers()
      setIsDialogOpen(false)
      setSelectedRegistrationId("")
      setJerseyNumber("")
      setPosition("")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemovePlayer(rosterId: string, playerName: string) {
    if (!confirm(`Are you sure you want to remove ${playerName} from the roster?`)) return

    try {
      const response = await fetch(`/api/admin/rosters?id=${rosterId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to remove player")
      }

      await fetchTeam()
      await fetchAvailablePlayers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleUpdateRoster(rosterId: string, updates: Partial<RosterEntry>) {
    try {
      const response = await fetch("/api/admin/rosters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rosterId, ...updates }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update roster")
      }

      await fetchTeam()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Team not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/admin/teams">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </a>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{team.name}</h1>
          <p className="text-gray-600 mt-1">
            {team.season.program.name} - {team.season.name}
          </p>
        </div>
      </div>

      {/* Team Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Team Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Division</p>
              <p className="font-medium">{team.division || "None"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Roster Size</p>
              <p className="font-medium">
                {team.rosters.length} / {team.maxRosterSize || "∞"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Head Coach</p>
              <p className="font-medium">
                {team.coach
                  ? `${team.coach.firstName || ""} ${team.coach.lastName || ""}`.trim() || team.coach.email
                  : "Not assigned"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Team Color</p>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: team.color || "#3b82f6" }}
                />
                <span className="font-medium">{team.color || "#3b82f6"}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roster Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Roster</CardTitle>
            <CardDescription>
              {team.rosters.length} player{team.rosters.length !== 1 ? "s" : ""} on roster
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFreeAgentsOnly((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                freeAgentsOnly
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
              }`}
            >
              Free agents only
            </button>
            <Button
              onClick={() => setIsDialogOpen(true)}
              disabled={availablePlayers.length === 0 || (team.maxRosterSize !== null && team.rosters.length >= team.maxRosterSize)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Player
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {team.rosters.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No players on roster yet</p>
              {availablePlayers.length > 0 ? (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Player
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No confirmed registrations available for this season
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.rosters.map((roster) => (
                  <TableRow key={roster.id}>
                    <TableCell className="font-medium">
                      <Input
                        value={roster.jerseyNumber || ""}
                        onChange={(e) => handleUpdateRoster(roster.id, { jerseyNumber: e.target.value })}
                        className="w-16"
                        placeholder="--"
                      />
                    </TableCell>
                    <TableCell className="ph-mask">
                      {roster.registration.familyMember.firstName}{" "}
                      {roster.registration.familyMember.lastName}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={roster.position || ""}
                        onChange={(e) => handleUpdateRoster(roster.id, { position: e.target.value })}
                        className="w-32"
                        placeholder="Position"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={roster.status}
                        onValueChange={(value) => handleUpdateRoster(roster.id, { status: value as any })}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="injured">Injured</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          handleRemovePlayer(
                            roster.id,
                            `${roster.registration.familyMember.firstName} ${roster.registration.familyMember.lastName}`
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Player Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Player to Roster</DialogTitle>
            <DialogDescription>
              Select a registered player to add to {team.name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddPlayer}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Player</Label>
                <Select value={selectedRegistrationId} onValueChange={setSelectedRegistrationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a player" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlayers.map((player) => (
                      <SelectItem key={player.id} value={player.id} className="ph-mask">
                        {player.familyMember.firstName} {player.familyMember.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availablePlayers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No unassigned players available
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jerseyNumber">Jersey Number (optional)</Label>
                  <Input
                    id="jerseyNumber"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Position (optional)</Label>
                  <Input
                    id="position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="Forward"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedRegistrationId}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add to Roster"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
