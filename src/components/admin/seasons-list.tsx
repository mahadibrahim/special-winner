"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Calendar } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { groupSpacesByLocation } from "@/lib/admin/group-spaces"
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
  teamPriceCents: number | null
  signupModes: string[]
  depositCents: number | null
  allowDeposit: boolean
  status: string
  scheduleNotes: string | null
  termSlug?: string | null
  termLabel?: string | null
  divisionGender?: "coed" | "mens" | "womens" | null
  skillLevel?: "a" | "b" | "c" | "d" | "open" | null
  dayOfWeek?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null
  startTime?: string | null
  endTime?: string | null
  venueId: string | null
  interestCount?: number
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
  location: { id: string; name: string }
}

const statusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "forming", label: "Forming", color: "bg-amber-100 text-amber-800" },
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
    teamPriceCents: "",
    allowIndividual: true,
    allowTeam: false,
    depositCents: "",
    allowDeposit: true,
    status: "draft",
    scheduleNotes: "",
    termSlug: "",
    termLabel: "",
    divisionGender: "",
    skillLevel: "",
    dayOfWeek: "",
    startTime: "",
    endTime: "",
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
      teamPriceCents: "",
      allowIndividual: true,
      allowTeam: false,
      depositCents: "",
      allowDeposit: true,
      status: "draft",
      scheduleNotes: "",
      termSlug: "",
      termLabel: "",
      divisionGender: "",
      skillLevel: "",
      dayOfWeek: "",
      startTime: "",
      endTime: "",
    })
    setScaffold({ type: "empty" })
    setIsDialogOpen(true)
  }

  function openEditDialog(season: Season) {
    setEditingSeason(season)
    const modes = season.signupModes ?? ["individual"]
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
      teamPriceCents: season.teamPriceCents != null ? (season.teamPriceCents / 100).toString() : "",
      allowIndividual: modes.includes("individual"),
      allowTeam: modes.includes("team"),
      depositCents: season.depositCents ? (season.depositCents / 100).toString() : "",
      allowDeposit: season.allowDeposit,
      status: season.status,
      scheduleNotes: season.scheduleNotes || "",
      termSlug: season.termSlug || "",
      termLabel: season.termLabel || "",
      divisionGender: season.divisionGender || "",
      skillLevel: season.skillLevel || "",
      dayOfWeek: season.dayOfWeek || "",
      startTime: season.startTime || "",
      endTime: season.endTime || "",
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
    const modes = source.signupModes ?? ["individual"]
    setFormData((prev) => ({
      ...prev,
      ageGroupId: source.ageGroup?.id || "",
      venueId: source.venueId || "",
      maxParticipants: source.maxParticipants?.toString() || "",
      priceCents: (source.priceCents / 100).toString(),
      teamPriceCents: source.teamPriceCents != null ? (source.teamPriceCents / 100).toString() : "",
      allowIndividual: modes.includes("individual"),
      allowTeam: modes.includes("team"),
      depositCents: source.depositCents ? (source.depositCents / 100).toString() : "",
      allowDeposit: source.allowDeposit,
      scheduleNotes: source.scheduleNotes || "",
      termSlug: source.termSlug || "",
      termLabel: source.termLabel || "",
      divisionGender: source.divisionGender || "",
      skillLevel: source.skillLevel || "",
      dayOfWeek: source.dayOfWeek || "",
      startTime: source.startTime || "",
      endTime: source.endTime || "",
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Build signup_modes array from the two checkboxes; require at least one.
    const signupModes: string[] = []
    if (formData.allowIndividual) signupModes.push("individual")
    if (formData.allowTeam) signupModes.push("team")
    if (signupModes.length === 0) {
      setError("At least one signup mode (individual or team) must be enabled.")
      setIsSubmitting(false)
      return
    }

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
        teamPriceCents: formData.allowTeam && formData.teamPriceCents
          ? Math.round(parseFloat(formData.teamPriceCents) * 100)
          : null,
        signupModes,
        depositCents: formData.depositCents ? Math.round(parseFloat(formData.depositCents) * 100) : null,
        allowDeposit: formData.allowDeposit,
        status: formData.status,
        scheduleNotes: formData.scheduleNotes || null,
        termSlug: formData.termSlug || null,
        termLabel: formData.termLabel || null,
        divisionGender: formData.divisionGender || null,
        skillLevel: formData.skillLevel || null,
        dayOfWeek: formData.dayOfWeek || null,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
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
                          {season.status === "forming" && (
                            <span className="text-xs text-ink-muted ml-2">{season.interestCount ?? 0} interested</span>
                          )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit season ${season.name}`}
                          title={`Edit season ${season.name}`}
                          onClick={() => openEditDialog(season)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete season ${season.name}`}
                          title={`Delete season ${season.name}`}
                          onClick={() => handleDelete(season)}
                        >
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
                <Label>Space</Label>
                <Select
                  value={formData.venueId || "none"}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, venueId: v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a space (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No space assigned</SelectItem>
                    {groupSpacesByLocation(venuesForProgram).map((group) => (
                      <SelectGroup key={group.locationName}>
                        <SelectLabel>{group.locationName}</SelectLabel>
                        {group.spaces.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectGroup>
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

              {/* Signup modes — drives which signup paths the season accepts */}
              <div className="space-y-2 rounded-lg border border-border p-4 bg-cream-2/50">
                <Label className="font-semibold">Signup modes</Label>
                <p className="text-xs text-ink-muted">
                  Which paths can a registrant take? At least one is required.
                </p>
                <div className="flex flex-wrap gap-4 pt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowIndividual"
                      checked={formData.allowIndividual}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, allowIndividual: checked === true }))
                      }
                    />
                    <Label htmlFor="allowIndividual" className="font-normal">
                      Individual / free agent (per-player)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowTeam"
                      checked={formData.allowTeam}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, allowTeam: checked === true }))
                      }
                    />
                    <Label htmlFor="allowTeam" className="font-normal">
                      Team (captain registers a roster)
                    </Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priceCents">
                    Individual price ($) {formData.allowIndividual && "*"}
                  </Label>
                  <Input
                    id="priceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, priceCents: e.target.value }))}
                    placeholder="90.00"
                    required={formData.allowIndividual}
                    disabled={!formData.allowIndividual && !formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    What one free agent pays. Required for individual signups; for team-only seasons we keep this equal to the team price.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teamPriceCents">
                    Team price ($) {formData.allowTeam && "*"}
                  </Label>
                  <Input
                    id="teamPriceCents"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.teamPriceCents}
                    onChange={(e) => setFormData((prev) => ({ ...prev, teamPriceCents: e.target.value }))}
                    placeholder="720.00"
                    disabled={!formData.allowTeam}
                    required={formData.allowTeam}
                  />
                  <p className="text-xs text-ink-muted">
                    What a captain pays for a full roster. Leave blank if team signup isn't offered.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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

              <div className="border-t border-border pt-4 mt-2">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
                  League page metadata (optional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="termLabel">Term label</Label>
                    <Input id="termLabel" value={formData.termLabel}
                      onChange={(e) => setFormData((p) => ({ ...p, termLabel: e.target.value }))}
                      placeholder="Fall 2026" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termSlug">Term slug</Label>
                    <Input id="termSlug" value={formData.termSlug}
                      onChange={(e) => setFormData((p) => ({ ...p, termSlug: e.target.value }))}
                      placeholder="fall-2026" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Division gender</Label>
                    <Select value={formData.divisionGender || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, divisionGender: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="coed">Coed</SelectItem>
                        <SelectItem value="mens">Men's</SelectItem>
                        <SelectItem value="womens">Women's</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Skill level</Label>
                    <Select value={formData.skillLevel || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, skillLevel: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="a">A · Elite</SelectItem>
                        <SelectItem value="b">B · Competitive</SelectItem>
                        <SelectItem value="c">C · Rec+</SelectItem>
                        <SelectItem value="d">D · Beginner</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Night</Label>
                    <Select value={formData.dayOfWeek || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, dayOfWeek: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {["mon","tue","wed","thu","fri","sat","sun"].map((d) => (
                          <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start time</Label>
                    <Input id="startTime" type="time" value={formData.startTime}
                      onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End time</Label>
                    <Input id="endTime" type="time" value={formData.endTime}
                      onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
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
