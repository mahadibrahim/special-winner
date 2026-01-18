"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, MapPin, Home, TreePine } from "lucide-react"
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

interface Location {
  id: string
  name: string
}

interface Venue {
  id: string
  locationId: string
  name: string
  address: string | null
  fieldCount: number | null
  indoor: boolean | null
  notes: string | null
  active: boolean
  location: Location | null
}

interface VenuesListProps {
  locations: Location[]
}

export function VenuesList({ locations }: VenuesListProps) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [formData, setFormData] = useState({
    locationId: "",
    name: "",
    address: "",
    fieldCount: 1,
    indoor: false,
    notes: "",
    active: true,
  })

  useEffect(() => {
    fetchVenues()
  }, [])

  async function fetchVenues() {
    try {
      const response = await fetch("/api/admin/venues")
      if (!response.ok) throw new Error("Failed to fetch venues")
      const data = await response.json()
      setVenues(data.venues)
    } catch (err) {
      setError("Failed to load venues")
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
      address: "",
      fieldCount: 1,
      indoor: false,
      notes: "",
      active: true,
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(venue: Venue) {
    setEditingVenue(venue)
    setFormData({
      locationId: venue.locationId,
      name: venue.name,
      address: venue.address || "",
      fieldCount: venue.fieldCount || 1,
      indoor: venue.indoor || false,
      notes: venue.notes || "",
      active: venue.active,
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/venues"
      const method = editingVenue ? "PUT" : "POST"
      const body = editingVenue
        ? { id: editingVenue.id, ...formData }
        : formData

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save venue")
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
    if (!confirm(`Are you sure you want to delete "${venue.name}"?`)) return

    try {
      const response = await fetch(`/api/admin/venues?id=${venue.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete venue")
      }

      await fetchVenues()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Venues</h1>
          <p className="text-gray-600 mt-1">Manage the venues and facilities for your programs</p>
        </div>
        <Button onClick={openCreateDialog} disabled={locations.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add Venue
        </Button>
      </div>

      {locations.length === 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              You need to create at least one location before adding venues.
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
            <p className="text-muted-foreground mb-4">No venues configured yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Venue
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
            <DialogTitle>{editingVenue ? "Edit Venue" : "Add Venue"}</DialogTitle>
            <DialogDescription>
              {editingVenue ? "Update the venue details" : "Add a new venue or facility"}
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
                <Label htmlFor="name">Venue Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Main Field, Gym A, etc."
                  required
                />
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

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional information about this venue"
                  rows={2}
                />
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
                  "Update Venue"
                ) : (
                  "Add Venue"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
