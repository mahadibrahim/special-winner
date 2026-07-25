"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, Pencil, Trash2, Loader2, Shirt, Copy, ExternalLink } from "lucide-react"
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
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface MerchKit {
  id: string
  teamId: string
  name: string
  shareToken: string
  orderOpensAt: string | null
  orderClosesAt: string | null
  pickupLocation: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

interface TeamOption {
  id: string
  name: string
  season: { id: string; name: string } | null
  program: { id: string; name: string } | null
}

interface KitFormState {
  teamId: string
  name: string
  orderOpensAt: string
  orderClosesAt: string
  pickupLocation: string
  active: boolean
}

const EMPTY_FORM: KitFormState = {
  teamId: "",
  name: "",
  orderOpensAt: "",
  orderClosesAt: "",
  pickupLocation: "",
  active: true,
}

function toDatetimeLocal(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : ""
}

function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function MerchKitsList() {
  useHydrationBeacon()

  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const [kits, setKits] = useState<MerchKit[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingKit, setEditingKit] = useState<MerchKit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<KitFormState>(EMPTY_FORM)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [kitsRes, teamsRes] = await Promise.all([
        fetch("/api/admin/merch/kits"),
        fetch("/api/admin/teams"),
      ])
      if (!kitsRes.ok) throw new Error("Failed to fetch kits")
      const kitsData = await kitsRes.json()
      setKits(kitsData.kits ?? [])

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json()
        setTeams(teamsData.teams ?? [])
      }
    } catch (err) {
      console.error(err)
      toast.error("Failed to load kits")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const teamById = new Map(teams.map((t) => [t.id, t]))

  function openCreateDialog() {
    setEditingKit(null)
    setFormData(EMPTY_FORM)
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(kit: MerchKit) {
    setEditingKit(kit)
    setFormData({
      teamId: kit.teamId,
      name: kit.name,
      orderOpensAt: toDatetimeLocal(kit.orderOpensAt),
      orderClosesAt: toDatetimeLocal(kit.orderClosesAt),
      pickupLocation: kit.pickupLocation ?? "",
      active: kit.active,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/merch/kits"
      const method = editingKit ? "PUT" : "POST"
      const body = {
        ...(editingKit ? { id: editingKit.id } : {}),
        teamId: formData.teamId,
        name: formData.name,
        orderOpensAt: toIsoOrNull(formData.orderOpensAt),
        orderClosesAt: toIsoOrNull(formData.orderClosesAt),
        pickupLocation: formData.pickupLocation || null,
        active: formData.active,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save kit")

      await load()
      setIsDialogOpen(false)
      toast.success(editingKit ? "Kit updated" : "Kit created")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save kit")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(kit: MerchKit) {
    const ok = await confirm({
      title: "Delete kit?",
      description: (
        <>
          Delete the kit <strong>{kit.name}</strong>? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/merch/kits?id=${kit.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete kit")
      await load()
      toast.success(`Deleted "${kit.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete kit")
    }
  }

  function copyShareLink(kit: MerchKit) {
    const url = `${window.location.origin}/kit/${kit.shareToken}`
    navigator.clipboard.writeText(url)
    toast.success("Share link copied")
  }

  function windowLabel(kit: MerchKit): string {
    if (!kit.orderOpensAt && !kit.orderClosesAt) return "No order window set"
    const opens = kit.orderOpensAt ? formatDate(kit.orderOpensAt) : "now"
    const closes = kit.orderClosesAt ? formatDate(kit.orderClosesAt) : "no close date"
    return `Opens ${opens} · Closes ${closes}`
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
          <h1 className="text-3xl font-bold text-gray-900">Team kits</h1>
          <p className="text-gray-600 mt-1">
            Create shareable order pages for team-specific merch (jerseys, personalization,
            pickup).
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={teams.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          New kit
        </Button>
      </div>

      {teams.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          No teams found for this organization yet — create a team before adding a kit.
        </p>
      )}

      {kits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shirt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No kits yet</p>
            <Button onClick={openCreateDialog} disabled={teams.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Create first kit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kits.map((kit) => {
            const team = teamById.get(kit.teamId)
            return (
              <Card key={kit.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        <a
                          href={`/admin/merch/kits/${kit.id}`}
                          className="hover:underline"
                        >
                          {kit.name}
                        </a>
                      </CardTitle>
                      <CardDescription>
                        {team
                          ? `${team.name}${team.season || team.program ? ` — ${[team.season?.name, team.program?.name].filter(Boolean).join(" / ")}` : ""}`
                          : "Team not found"}
                      </CardDescription>
                    </div>
                    <Badge className={kit.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {kit.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground mb-1">{windowLabel(kit)}</p>
                  {kit.pickupLocation && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Pickup: {kit.pickupLocation}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <button
                      type="button"
                      onClick={() => copyShareLink(kit)}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> /kit/{kit.shareToken.slice(0, 8)}…
                    </button>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`/admin/merch/kits/${kit.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(kit)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(kit)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingKit ? "Edit kit" : "New kit"}</DialogTitle>
            <DialogDescription>
              {editingKit ? "Update the kit details" : "Create a new team kit order page"}
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
                <Label>Team</Label>
                <Select
                  value={formData.teamId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, teamId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                        {(team.season || team.program) &&
                          ` (${[team.season?.name, team.program?.name].filter(Boolean).join(" / ")})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kit-name">Kit name</Label>
                <Input
                  id="kit-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="U12 Thunder Fall Kit"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orderOpensAt">Order opens (optional)</Label>
                  <Input
                    id="orderOpensAt"
                    type="datetime-local"
                    value={formData.orderOpensAt}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, orderOpensAt: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderClosesAt">Order closes (optional)</Label>
                  <Input
                    id="orderClosesAt"
                    type="datetime-local"
                    value={formData.orderClosesAt}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, orderClosesAt: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickupLocation">Pickup location (optional)</Label>
                <Input
                  id="pickupLocation"
                  value={formData.pickupLocation}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, pickupLocation: e.target.value }))
                  }
                  placeholder="Front office, Powell location"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData((prev) => ({ ...prev, active: e.target.checked }))}
                  className="h-4 w-4"
                />
                <Label htmlFor="active" className="font-normal">
                  Active (kit accepts orders)
                </Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !formData.teamId}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingKit ? (
                  "Update"
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
