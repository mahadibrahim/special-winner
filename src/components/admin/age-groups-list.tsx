"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface AgeGroup {
  id: string
  name: string
  minAge: number
  maxAge: number
  birthDateCutoff: string | null
  description: string | null
}

export function AgeGroupsList() {
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingAgeGroup, setEditingAgeGroup] = useState<AgeGroup | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    minAge: 0,
    maxAge: 6,
    birthDateCutoff: "",
    description: "",
  })

  useEffect(() => {
    fetchAgeGroups()
  }, [])

  async function fetchAgeGroups() {
    try {
      const response = await fetch("/api/admin/age-groups")
      if (!response.ok) throw new Error("Failed to fetch age groups")
      const data = await response.json()
      setAgeGroups(data.ageGroups)
    } catch (err) {
      setError("Failed to load age groups")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingAgeGroup(null)
    setFormData({
      name: "",
      minAge: 0,
      maxAge: 6,
      birthDateCutoff: "",
      description: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(ageGroup: AgeGroup) {
    setEditingAgeGroup(ageGroup)
    setFormData({
      name: ageGroup.name,
      minAge: ageGroup.minAge,
      maxAge: ageGroup.maxAge,
      birthDateCutoff: ageGroup.birthDateCutoff || "",
      description: ageGroup.description || "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/age-groups"
      const method = editingAgeGroup ? "PUT" : "POST"
      const body = editingAgeGroup
        ? { id: editingAgeGroup.id, ...formData, birthDateCutoff: formData.birthDateCutoff || null }
        : { ...formData, birthDateCutoff: formData.birthDateCutoff || null }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save age group")
      }

      await fetchAgeGroups()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(ageGroup: AgeGroup) {
    if (!confirm(`Are you sure you want to delete "${ageGroup.name}"?`)) return

    try {
      const response = await fetch(`/api/admin/age-groups?id=${ageGroup.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete age group")
      }

      await fetchAgeGroups()
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
          <h1 className="text-3xl font-bold text-gray-900">Age Groups</h1>
          <p className="text-gray-600 mt-1">Manage the age groups for your programs</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Age Group
        </Button>
      </div>

      {ageGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No age groups configured yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Age Group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ageGroups.map((ageGroup) => (
            <Card key={ageGroup.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-blue-100 text-blue-600">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{ageGroup.name}</CardTitle>
                      <CardDescription>
                        Ages {ageGroup.minAge} - {ageGroup.maxAge}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {ageGroup.description && (
                  <p className="text-sm text-muted-foreground mb-3">{ageGroup.description}</p>
                )}
                {ageGroup.birthDateCutoff && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Cutoff: {new Date(ageGroup.birthDateCutoff).toLocaleDateString()}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(ageGroup)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(ageGroup)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgeGroup ? "Edit Age Group" : "Add Age Group"}</DialogTitle>
            <DialogDescription>
              {editingAgeGroup ? "Update the age group details" : "Add a new age group for your programs"}
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
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="U6, U8, etc."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minAge">Min Age</Label>
                  <Input
                    id="minAge"
                    type="number"
                    value={formData.minAge}
                    onChange={(e) => setFormData((prev) => ({ ...prev, minAge: parseInt(e.target.value) || 0 }))}
                    min={0}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxAge">Max Age</Label>
                  <Input
                    id="maxAge"
                    type="number"
                    value={formData.maxAge}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxAge: parseInt(e.target.value) || 1 }))}
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDateCutoff">Birth Date Cutoff (optional)</Label>
                <Input
                  id="birthDateCutoff"
                  type="date"
                  value={formData.birthDateCutoff}
                  onChange={(e) => setFormData((prev) => ({ ...prev, birthDateCutoff: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Players must be born on or before this date to qualify
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Additional notes about this age group"
                  rows={3}
                />
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
                ) : editingAgeGroup ? (
                  "Update Age Group"
                ) : (
                  "Add Age Group"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
