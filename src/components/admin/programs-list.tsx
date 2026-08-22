"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, CalendarDays } from "lucide-react"
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
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { programTypes } from "@/lib/programs/program-type-labels"
import { CAMP_TYPES } from "@/lib/youth/camp-page-content"

// The /youth/camps/[type] family pages filter the catalog by EXACT program
// slug (there is no camp-family column — the program is the family). A camp
// program saved under any other slug still shows on the camps hub but is
// invisible on its family page, silently (issue #577). This list powers the
// non-blocking warning in the form below.
const CAMP_FAMILY_SLUGS = CAMP_TYPES.flatMap((t) => t.programSlugs)

interface Program {
  id: string
  name: string
  slug: string
  description: string | null
  programType: string
  active: boolean
  venueId: string | null
  location: { id: string; name: string; slug: string }
  sport: { id: string; name: string; slug: string; icon: string | null; color: string | null }
  venue: { id: string; name: string } | null
}

interface Sport {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

interface Location {
  id: string
  name: string
  slug: string
}

interface VenueOption {
  id: string
  name: string
  locationId: string
  location: { id: string; name: string }
  organizationName?: string
  organizationSlug?: string
}

export function ProgramsList({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [programs, setPrograms] = useState<Program[]>([])
  const [sports, setSports] = useState<Sport[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingProgram, setEditingProgram] = useState<Program | null>(null)
  const [formData, setFormData] = useState({
    locationId: "",
    sportId: "",
    venueId: "" as string,
    name: "",
    slug: "",
    description: "",
    programType: "league",
    active: true,
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const venueScope = isSuperAdmin ? "?scope=all" : ""
      const [programsRes, sportsRes, locationsRes, venuesRes] = await Promise.all([
        fetch("/api/admin/programs"),
        fetch("/api/admin/sports"),
        fetch("/api/admin/locations"),
        fetch(`/api/admin/venues${venueScope}`),
      ])

      if (!programsRes.ok || !sportsRes.ok || !locationsRes.ok) {
        throw new Error("Failed to fetch data")
      }

      const [programsData, sportsData, locationsData, venuesData] = await Promise.all([
        programsRes.json(),
        sportsRes.json(),
        locationsRes.json(),
        venuesRes.ok ? venuesRes.json() : { venues: [] },
      ])

      setPrograms(programsData.programs)
      setSports(sportsData.sports)
      setLocations(locationsData.locations)
      setVenueOptions(venuesData.venues ?? [])
    } catch (err) {
      setError("Failed to load data")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingProgram(null)
    setFormData({
      locationId: locations[0]?.id || "",
      sportId: sports[0]?.id || "",
      venueId: "",
      name: "",
      slug: "",
      description: "",
      programType: "league",
      active: true,
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(program: Program) {
    setEditingProgram(program)
    setFormData({
      locationId: program.location.id,
      sportId: program.sport.id,
      venueId: program.venueId || "",
      name: program.name,
      slug: program.slug,
      description: program.description || "",
      programType: program.programType,
      active: program.active,
    })
    setIsDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingProgram ? prev.slug : name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const method = editingProgram ? "PUT" : "POST"
      const payload = {
        ...formData,
        // Send null when no venue selected, so backend clears it on PUT
        venueId: formData.venueId || null,
      }
      const body = editingProgram ? { id: editingProgram.id, ...payload } : payload

      const response = await fetch("/api/admin/programs", {
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

  async function handleDelete(program: Program) {
    const ok = await confirm({
      title: "Delete program?",
      description: <>Delete <strong>{program.name}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/programs?id=${program.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      await fetchData()
      toast.success(`Deleted "${program.name}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete program")
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
          <h1 className="text-3xl font-bold text-gray-900">Programs</h1>
          <p className="text-gray-600 mt-1">Manage leagues, camps, clinics, and more</p>
        </div>
        <Button onClick={openCreateDialog} disabled={sports.length === 0 || locations.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add Program
        </Button>
      </div>

      {sports.length === 0 || locations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              You need to create {sports.length === 0 ? "sports" : ""}
              {sports.length === 0 && locations.length === 0 ? " and " : ""}
              {locations.length === 0 ? "locations" : ""} before adding programs.
            </p>
            <div className="flex justify-center gap-2">
              {sports.length === 0 && (
                <Button variant="outline" asChild>
                  <a href="/admin/sports">Add Sports</a>
                </Button>
              )}
              {locations.length === 0 && (
                <Button variant="outline" asChild>
                  <a href="/admin/locations">Add Locations</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No programs created yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Program
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((program) => (
            <Card key={program.id} className={!program.active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{
                        backgroundColor: `${program.sport.color || "#3b82f6"}20`,
                        color: program.sport.color || "#3b82f6",
                      }}
                    >
                      {program.sport.icon || "🏃"}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{program.name}</CardTitle>
                      <CardDescription>{program.location.name}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary">{program.sport.name}</Badge>
                  <Badge variant="outline">{programTypes.find(t => t.value === program.programType)?.label}</Badge>
                </div>
                {program.venue && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {(() => {
                      const v = venueOptions.find(o => o.id === program.venue!.id)
                      const orgLabel = v?.organizationName ? `${v.organizationName} — ` : ""
                      return `${orgLabel}${program.venue!.name}`
                    })()}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${program.active ? "text-green-600" : "text-gray-500"}`}>
                    {program.active ? "Active" : "Inactive"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild title="Plan division days">
                      <a href={`/admin/programs/${program.id}/day-planner`} aria-label="Plan division days">
                        <CalendarDays className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(program)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(program)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProgram ? "Edit Program" : "Add Program"}</DialogTitle>
            <DialogDescription>
              {editingProgram ? "Update program details" : "Create a new program"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select
                    value={formData.locationId}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, locationId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Sport *</Label>
                  <Select
                    value={formData.sportId}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, sportId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sport" />
                    </SelectTrigger>
                    <SelectContent>
                      {sports.map((sport) => (
                        <SelectItem key={sport.id} value={sport.id}>
                          {sport.icon} {sport.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Youth Soccer League"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="youth-soccer-league"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Program Type</Label>
                  <Select
                    value={formData.programType}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, programType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {programTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Non-blocking: a camp is allowed to live outside the four
                  families, but nobody should end up there by typo. */}
              {formData.programType === "camp" && formData.slug && !CAMP_FAMILY_SLUGS.includes(formData.slug) && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                  This slug doesn&rsquo;t match any camp family, so seasons under it will
                  appear on /youth/camps but on none of the family pages. Family slugs:{" "}
                  {CAMP_FAMILY_SLUGS.join(", ")}.
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="A brief description of the program"
                />
              </div>

              {venueOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Space (optional)</Label>
                  <Select
                    value={formData.venueId || "__none__"}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, venueId: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No space assigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No space assigned</SelectItem>
                      {isSuperAdmin ? (
                        // Group by organization for super_admin cross-org view
                        (() => {
                          const byOrg: Record<string, VenueOption[]> = {}
                          for (const v of venueOptions) {
                            const key = v.organizationName ?? "My Organization"
                            if (!byOrg[key]) byOrg[key] = []
                            byOrg[key].push(v)
                          }
                          return Object.entries(byOrg).map(([orgName, orgVenues]) => (
                            <div key={orgName}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{orgName}</div>
                              {orgVenues.map((v) => (
                                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                              ))}
                            </div>
                          ))
                        })()
                      ) : (
                        groupSpacesByLocation(venueOptions).map((group) => (
                          <SelectGroup key={group.locationName}>
                            <SelectLabel>{group.locationName}</SelectLabel>
                            {group.spaces.map((v) => (
                              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, active: checked === true }))}
                />
                <Label htmlFor="active" className="font-normal">Active</Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingProgram ? "Update" : "Add"} Program
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
