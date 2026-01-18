"use client"

import { useState, useEffect } from "react"
import { Loader2, UserCheck, UserX, ArrowUp, ArrowDown, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface WaitlistEntry {
  id: string
  status: string
  waitlistPosition: number | null
  waitlistExpiresAt: string | null
  createdAt: string
  familyMember: {
    id: string
    firstName: string
    lastName: string
    birthDate: string
  }
  parent: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  season: {
    id: string
    name: string
  }
  program: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
  }
}

interface Season {
  id: string
  name: string
  programName: string
}

export function WaitlistManager() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeason, setSelectedSeason] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "promote" | "remove" } | null>(null)

  useEffect(() => {
    fetchWaitlist()
  }, [selectedSeason])

  async function fetchWaitlist() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedSeason !== "all") {
        params.set("seasonId", selectedSeason)
      }
      const response = await fetch(`/api/admin/waitlist?${params}`)
      if (!response.ok) throw new Error("Failed to fetch waitlist")
      const data = await response.json()
      setWaitlist(data.waitlist)
      setSeasons(data.seasons)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAction(registrationId: string, action: "promote" | "remove") {
    setActionLoading(registrationId)
    try {
      const response = await fetch("/api/admin/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, action }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process action")
      }

      await fetchWaitlist()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setActionLoading(null)
      setConfirmAction(null)
    }
  }

  async function handleReorder(registrationId: string, direction: "up" | "down") {
    const entry = waitlist.find((w) => w.id === registrationId)
    if (!entry || entry.waitlistPosition === null) return

    const newPosition = direction === "up" ? entry.waitlistPosition - 1 : entry.waitlistPosition + 1
    if (newPosition < 1 || newPosition > waitlist.length) return

    setActionLoading(registrationId)
    try {
      const response = await fetch("/api/admin/waitlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, newPosition }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to reorder")
      }

      await fetchWaitlist()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function calculateAge(birthDate: string) {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Waitlist Management</h1>
          <p className="text-gray-600 mt-1">Manage waitlisted registrations and promote players</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Filter by season" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Seasons</SelectItem>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id}>
                  {season.programName} - {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {waitlist.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No players on the waitlist</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Waitlist ({waitlist.length})</CardTitle>
            <CardDescription>Players waiting for available spots</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {waitlist.map((entry, index) => (
                <div key={entry.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0 || actionLoading === entry.id}
                        onClick={() => handleReorder(entry.id, "up")}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Badge variant="outline" className="text-lg font-bold px-3">
                        #{entry.waitlistPosition || index + 1}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === waitlist.length - 1 || actionLoading === entry.id}
                        onClick={() => handleReorder(entry.id, "down")}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      <div className="font-medium">
                        {entry.familyMember.firstName} {entry.familyMember.lastName}
                        <span className="text-muted-foreground ml-2">
                          (Age {calculateAge(entry.familyMember.birthDate)})
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Parent: {entry.parent.firstName} {entry.parent.lastName} ({entry.parent.email})
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.sport.name} - {entry.program.name} - {entry.season.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Added to waitlist: {formatDate(entry.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmAction({ id: entry.id, action: "promote" })}
                      disabled={actionLoading === entry.id}
                    >
                      {actionLoading === entry.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 mr-2" />
                          Promote
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmAction({ id: entry.id, action: "remove" })}
                      disabled={actionLoading === entry.id}
                    >
                      <UserX className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "promote" ? "Promote from Waitlist" : "Remove from Waitlist"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "promote"
                ? "This will move the player from the waitlist to confirmed status. They will receive a confirmation email."
                : "This will remove the player from the waitlist. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && handleAction(confirmAction.id, confirmAction.action)}
              className={confirmAction?.action === "remove" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {confirmAction?.action === "promote" ? "Promote" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
