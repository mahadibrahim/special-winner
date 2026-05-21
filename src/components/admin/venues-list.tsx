"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, MapPin, Home, TreePine, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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

interface Location {
  id: string
  name: string
}

interface Venue {
  id: string
  locationId: string
  name: string
  slug: string | null
  address: string | null
  fieldCount: number | null
  indoor: boolean | null
  owned: boolean | null
  concessions: boolean | null
  parkingManaged: boolean | null
  notes: string | null
  active: boolean
  location: Location | null
  rentalEnabled: boolean
  rentalHourlyRateCents: number | null
  rentalOpenMinute: number | null
  rentalCloseMinute: number | null
}

interface VenuesListProps {
  locations: Location[]
}

export function VenuesList({ locations }: VenuesListProps) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [formData, setFormData] = useState({
    locationId: "",
    name: "",
    slug: "",
    address: "",
    fieldCount: 1,
    indoor: false,
    owned: false,
    concessions: false,
    parkingManaged: false,
    notes: "",
    active: true,
    rentalEnabled: false,
    rentalHourlyRateDollars: "" as string, // UI dollars string; converted to cents on submit
    rentalOpenTime: "" as string,          // HH:MM string; converted to minutes on submit
    rentalCloseTime: "" as string,         // HH:MM string; converted to minutes on submit
  })

  useEffect(() => {
    fetchVenues()
  }, [])

  async function fetchVenues() {
    try {
      const response = await fetch("/api/admin/venues")
      if (!response.ok) throw new Error("Failed to fetch spaces")
      const data = await response.json()
      setVenues(data.venues)
    } catch (err) {
      setError("Failed to load spaces")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingVenue(null)
    setFormData({
      locationId: locations[0]?.id || "",
      name: "",
      slug: "",
      address: "",
      fieldCount: 1,
      indoor: false,
      owned: false,
      concessions: false,
      parkingManaged: false,
      notes: "",
      active: true,
      rentalEnabled: false,
      rentalHourlyRateDollars: "",
      rentalOpenTime: "",
      rentalCloseTime: "",
    })
    setIsDialogOpen(true)
  }

  function minutesToTime(minutes: number | null): string {
    if (minutes == null) return ""
    const h = Math.floor(minutes / 60).toString().padStart(2, "0")
    const m = (minutes % 60).toString().padStart(2, "0")
    return `${h}:${m}`
  }

  function openEditDialog(venue: Venue) {
    setEditingVenue(venue)
    setFormData({
      locationId: venue.locationId,
      name: venue.name,
      slug: venue.slug || "",
      address: venue.address || "",
      fieldCount: venue.fieldCount || 1,
      indoor: venue.indoor || false,
      owned: venue.owned || false,
      concessions: venue.concessions || false,
      parkingManaged: venue.parkingManaged || false,
      notes: venue.notes || "",
      active: venue.active,
      rentalEnabled: venue.rentalEnabled || false,
      rentalHourlyRateDollars: venue.rentalHourlyRateCents != null
        ? (venue.rentalHourlyRateCents / 100).toString()
        : "",
      rentalOpenTime: minutesToTime(venue.rentalOpenMinute),
      rentalCloseTime: minutesToTime(venue.rentalCloseMinute),
    })
    setIsDialogOpen(true)
  }

  function timeToMinutes(time: string): number | null {
    if (!time) return null
    const [hStr, mStr] = time.split(":")
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    if (isNaN(h) || isNaN(m)) return null
    return h * 60 + m
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Convert rental UI values to API values
    const rentalHourlyRateCents = formData.rentalHourlyRateDollars.trim() !== ""
      ? Math.round(parseFloat(formData.rentalHourlyRateDollars) * 100)
      : null
    const rentalOpenMinute = timeToMinutes(formData.rentalOpenTime)
    const rentalCloseMinute = timeToMinutes(formData.rentalCloseTime)

    const { rentalHourlyRateDollars, rentalOpenTime, rentalCloseTime, ...rest } = formData
    const apiPayload = {
      ...rest,
      rentalHourlyRateCents,
      rentalOpenMinute,
      rentalCloseMinute,
    }

    try {
      const url = "/api/admin/venues"
      const method = editingVenue ? "PUT" : "POST"
      const body = editingVenue
        ? { id: editingVenue.id, ...apiPayload }
        : apiPayload

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save space")
      }

      await fetchVenues()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(venue: Venue) {
    const ok = await confirm({
      title: "Delete space?",
      description: <>Delete <strong>{venue.name}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/venues?id=${venue.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete venue")
      }

      await fetchVenues()
      toast.success(`Deleted "${venue.name}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete space")
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
          <h1 className="text-3xl font-bold text-gray-900">Spaces</h1>
          <p className="text-gray-600 mt-1">Manage the spaces within your facilities</p>
        </div>
        <Button onClick={openCreateDialog} disabled={locations.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add Space
        </Button>
      </div>

      {locations.length === 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              You need to create at least one location before adding spaces.
            </p>
            <a href="/admin/locations" className="text-primary hover:underline text-sm mt-2 inline-block">
              Go to Locations &rarr;
            </a>
          </CardContent>
        </Card>
      )}

      {venues.length === 0 && locations.length > 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No spaces configured yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Space
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {venues.map((venue) => (
            <Card key={venue.id} className={!venue.active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${venue.indoor ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                      {venue.indoor ? <Home className="h-6 w-6" /> : <TreePine className="h-6 w-6" />}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{venue.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {venue.location?.name || "Unknown location"}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {venue.address && (
                  <p className="text-sm text-muted-foreground mb-2">{venue.address}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <span>{venue.fieldCount || 1} field{(venue.fieldCount || 1) > 1 ? 's' : ''}</span>
                  <span>{venue.indoor ? 'Indoor' : 'Outdoor'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${venue.active ? "text-green-600" : "text-gray-500"}`}>
                    {venue.active ? "Active" : "Inactive"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild title="Manage staff">
                      <a href={`/admin/venues/${venue.id}/staff`}>
                        <Users className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(venue)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(venue)}>
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
            <DialogTitle>{editingVenue ? "Edit Space" : "Add Space"}</DialogTitle>
            <DialogDescription>
              {editingVenue ? "Update the space details" : "Add a new space"}
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
                <Label htmlFor="locationId">Location</Label>
                <Select
                  value={formData.locationId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, locationId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Space Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Main Field, Gym A, etc."
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Kiosk URL slug (optional)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                  placeholder="downtown"
                />
                <p className="text-xs text-muted-foreground">
                  Sets the venue's kiosk address — e.g. <code>/kiosk/downtown</code>.
                  Lowercase letters, numbers, and hyphens. Leave blank to use the venue ID.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address (optional)</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="123 Main St, City, State"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldCount">Number of Fields</Label>
                  <Input
                    id="fieldCount"
                    type="number"
                    value={formData.fieldCount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, fieldCount: parseInt(e.target.value) || 1 }))}
                    min={1}
                  />
                </div>

                <div className="space-y-2 flex items-end">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="indoor"
                      checked={formData.indoor}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, indoor: checked === true }))}
                    />
                    <Label htmlFor="indoor" className="font-normal">
                      Indoor facility
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-medium">Operational flags</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Drives which activity-tracking responsibilities apply at this space.
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="owned"
                      checked={formData.owned}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, owned: checked === true }))}
                    />
                    <Label htmlFor="owned" className="font-normal text-sm">
                      Owned facility (we run open/close, not a third-party host)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="concessions"
                      checked={formData.concessions}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, concessions: checked === true }))}
                    />
                    <Label htmlFor="concessions" className="font-normal text-sm">
                      Concessions on-site (cash reconcile, inventory, etc.)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="parkingManaged"
                      checked={formData.parkingManaged}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, parkingManaged: checked === true }))}
                    />
                    <Label htmlFor="parkingManaged" className="font-normal text-sm">
                      Parking we manage (parking setup checklist applies)
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional information about this space"
                  rows={2}
                />
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-medium">Field rentals</Label>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rentalEnabled"
                      checked={formData.rentalEnabled}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, rentalEnabled: checked === true }))}
                    />
                    <Label htmlFor="rentalEnabled" className="font-normal text-sm">
                      Enable field rentals at this space
                    </Label>
                  </div>

                  {formData.rentalEnabled && (
                    <div className="space-y-3 pl-6">
                      <div className="space-y-1">
                        <Label htmlFor="rentalHourlyRateDollars" className="text-sm">
                          Hourly rental rate (leave blank to use org default)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                          <Input
                            id="rentalHourlyRateDollars"
                            type="number"
                            min={0}
                            step={0.01}
                            className="pl-7"
                            value={formData.rentalHourlyRateDollars}
                            onChange={(e) => setFormData((prev) => ({ ...prev, rentalHourlyRateDollars: e.target.value }))}
                            placeholder="e.g. 95.00"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="rentalOpenTime" className="text-sm">Rentals open</Label>
                          <Input
                            id="rentalOpenTime"
                            type="time"
                            value={formData.rentalOpenTime}
                            onChange={(e) => setFormData((prev) => ({ ...prev, rentalOpenTime: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="rentalCloseTime" className="text-sm">Rentals close</Label>
                          <Input
                            id="rentalCloseTime"
                            type="time"
                            value={formData.rentalCloseTime}
                            onChange={(e) => setFormData((prev) => ({ ...prev, rentalCloseTime: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, active: checked === true }))}
                />
                <Label htmlFor="active" className="font-normal">
                  Active (available for scheduling)
                </Label>
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
                ) : editingVenue ? (
                  "Update Space"
                ) : (
                  "Add Space"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
