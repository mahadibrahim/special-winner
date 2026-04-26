"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Calendar } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SeasonScaffoldPicker, type ScaffoldChoice } from "./season-scaffold-picker"
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  maxParticipants: number | null
  priceCents: number
  depositCents: number | null
  allowDeposit: boolean
  status: string
  scheduleNotes: string | null
  venueId: string | null
  program: { id: string; name: string; slug: string }
  sport: { id: string; name: string; icon: string | null; color: string | null }
  location: { id: string; name: string }
  ageGroup: { id: string; name: string; minAge: number; maxAge: number } | null
}

interface Program {
  id: string
  name: string
  sport: { name: string; icon: string | null }
  location: { name: string }
}

interface AgeGroup {
  id: string
  name: string
  minAge: number
  maxAge: number
}

interface Venue {
  id: string
  name: string
  locationId: string
}

const statusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "open", label: "Open", color: "bg-green-100 text-green-700" },
  { value: "closed", label: "Closed", color: "bg-yellow-100 text-yellow-700" },
  { value: "active", label: "Active", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", color: "bg-purple-100 text-purple-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
]

export function SeasonsList() {
  useHydrationBeacon()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingSeason, setEditingSeason] = useState<Season | null>(null)
  const [scaffold, setScaffold] = useState<ScaffoldChoice>({ type: "empty" })
  const [formData, setFormData] = useState({
    programId: "",
    ageGroupId: "",
    venueId: "",
    name: "",
    slug: "",
    startDate: "",
    endDate: "",
    maxParticipants: "",
    priceCents: "",
    depositCents: "",
    allowDeposit: true,
    status: "draft",
    scheduleNotes: "",
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [seasonsRes, programsRes, ageGroupsRes, venuesRes] = await Promise.all([
        // include_test=1 so admins see the full catalog (test fixtures included)
        // on /admin/seasons. Walk-up registration / re-registration callers
        // omit this flag and get the test-free list.
        fetch("/api/admin/seasons?include_test=1"),
        fetch("/api/admin/programs"),
        fetch("/api/admin/age-groups"),
        fetch("/api/admin/venues"),
      ])

      if (!seasonsRes.ok || !programsRes.ok || !ageGroupsRes.ok || !venuesRes.ok) {
        throw new Error("Failed to fetch data")
      }

      const [seasonsData, programsData, ageGroupsData, venuesData] = await Promise.all([
        seasonsRes.json(),
        programsRes.json(),
        ageGroupsRes.json(),
        venuesRes.json(),
      ])

      setSeasons(seasonsData.seasons)
      setPrograms(programsData.programs)
      setAgeGroups(ageGroupsData.ageGroups)
      setVenues(venuesData.venues || [])
    } catch (err) {
      setError("Failed to load data")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingSeason(null)
    const today = new Date().toISOString().split("T")[0]
    setFormData({
      programId: programs[0]?.id || "",
      ageGroupId: "",
      venueId: "",
      name: "",
      slug: "",
      startDate: today,
      endDate: today,
      maxParticipants: "",
      priceCents: "",
      depositCents: "",
      allowDeposit: true,
      status: "draft",
      scheduleNotes: "",
    })
    setScaffold({ type: "empty" })
    setIsDialogOpen(true)
  }

  function openEditDialog(season: Season) {
    setEditingSeason(season)
    setFormData({
      programId: season.program.id,
      ageGroupId: season.ageGroup?.id || "",
      venueId: season.venueId || "",
      name: season.name,
      slug: season.slug,
      startDate: season.startDate,
      endDate: season.endDate,
      maxParticipants: season.maxParticipants?.toString() || "",
      priceCents: (season.priceCents / 100).toString(),
      depositCents: season.depositCents ? (season.depositCents / 100).toString() : "",
      allowDeposit: season.allowDeposit,
      status: season.status,
      scheduleNotes: season.scheduleNotes || "",
    })
    setScaffold({ type: "empty" })
    setIsDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingSeason ? prev.slug : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }))
  }

  function handleCloneSourceSelected(sourceSeasonId: string) {
    const source = seasons.find((s) => s.id === sourceSeasonId)
    if (!source) return
    setFormData((prev) => ({
      ...prev,
      ageGroupId: source.ageGroup?.id || "",
      venueId: source.venueId || "",
      maxParticipants: source.maxParticipants?.toString() || "",
      priceCents: (source.priceCents / 100).toString(),
      depositCents: source.depositCents ? (source.depositCents / 100).toString() : "",
      allowDeposit: source.allowDeposit,
      scheduleNotes: source.scheduleNotes || "",
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const method = editingSeason ? "PUT" : "POST"
      const body = {
        ...(editingSeason ? { id: editingSeason.id } : {}),
        programId: formData.programId,
        ageGroupId: formData.ageGroupId || null,
        venueId: formData.venueId || null,
        name: formData.name,
        slug: formData.slug,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants) : null,
        priceCents: Math.round(parseFloat(formData.priceCents || "0") * 100),
        depositCents: formData.depositCents ? Math.round(parseFloat(formData.depositCents) * 100) : null,
        allowDeposit: formData.allowDeposit,
        status: formData.status,
        scheduleNotes: formData.scheduleNotes || null,
        ...(editingSeason ? {} : { scaffold }),
      }

      const response = await fetch("/api/admin/seasons", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      await fetchData()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(season: Season) {
    const ok = await confirm({
      title: "Delete season?",
      description: <>Delete <strong>{season.name}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/seasons?id=${season.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await fetchData()
      toast.success(`Deleted "${season.name}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete season")
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const priorSeasons = formData.programId
    ? seasons
        .filter((s) => s.program.id === formData.programId)
        .map((s) => ({ id: s.id, name: s.name, startDate: s.startDate }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
    : []

  // Programs don't expose locationId in the current API; show all venues for now.
  // Server-side validation in Task 7 enforces the correct-location check.
  const venuesForProgram = venues

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Seasons</h1>
          <p className="text-gray-600 mt-1">Manage program seasons and registrations</p>
        </div>
        <Button onClick={openCreateDialog} disabled={programs.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add Season
        </Button>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Create programs before adding seasons</p>
            <Button variant="outline" asChild>
              <a href="/admin/programs">Add Programs</a>
            </Button>
          </CardContent>
        </Card>
      ) : seasons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No seasons created yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Season
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {seasons.map((season) => {
            const statusConfig = statusOptions.find((s) => s.value === season.status)
            return (
              <Card key={season.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{
                          backgroundColor: `${season.sport.color || "#3b82f6"}20`,
                          color: season.sport.color || "#3b82f6",
                        }}
                      >
                        {season.sport.icon || "🏃"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{season.name}</h3>
                          <Badge className={statusConfig?.color}>{statusConfig?.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {season.program.name} · {season.location.name}
                          {season.ageGroup && ` · ${season.ageGroup.name}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(season.startDate)} - {formatDate(season.endDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">${(season.priceCents / 100).toFixed(2)}</p>
                        {season.maxParticipants && (
                          <p className="text-sm text-muted-foreground">{season.maxParticipants} spots</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/admin/seasons/${season.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Manage gear →
                        </a>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(season)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(season)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSeason ? "Edit Season" : "Add Season"}</DialogTitle>
            <DialogDescription>
              {editingSeason ? "Update season details" : "Create a new season"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>
            )}

            {!editingSeason && (
              <div className="mb-4">
                <SeasonScaffoldPicker
                  priorSeasons={priorSeasons}
                  value={scaffold}
                  onChange={setScaffold}
                  onCloneSourceSelected={handleCloneSourceSelected}
                />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Program *</Label>
                <Select
                  value={formData.programId}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, programId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((prog) => (
                      <SelectItem key={prog.id} value={prog.id}>
                        {prog.sport.icon} {prog.name} ({prog.location.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Season Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Fall 2024"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="fall-2024"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Age Group</Label>
                <Select
                  value={formData.ageGroupId || "none"}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, ageGroupId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select age group (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No age restriction</SelectItem>
                    {ageGroups.map((ag) => (
                      <SelectItem key={ag.id} value={ag.id}>
                        {ag.name} (Ages {ag.minAge}-{ag.maxAge})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Venue</Label>
                <Select
                  value={formData.venueId || "none"}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, venueId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select venue (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No venue assigned</SelectItem>
                    {venuesForProgram.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priceCents">Price ($) *</Label>
                  <Input
                    id="priceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, priceCents: e.target.value }))}
                    placeholder="150.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depositCents">Deposit ($)</Label>
                  <Input
                    id="depositCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.depositCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, depositCents: e.target.value }))}
                    placeholder="25.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxParticipants">Max Spots</Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="1"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxParticipants: e.target.value }))}
                    placeholder="50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduleNotes">Schedule Notes</Label>
                <Input
                  id="scheduleNotes"
                  value={formData.scheduleNotes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, scheduleNotes: e.target.value }))}
                  placeholder="Saturdays 9-10am"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowDeposit"
                  checked={formData.allowDeposit}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, allowDeposit: checked === true }))}
                />
                <Label htmlFor="allowDeposit" className="font-normal">Allow deposit payment option</Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSeason ? "Update" : "Add"} Season
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
