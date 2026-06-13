"use client"

import { useState, useEffect } from "react"
import { Plus, Loader2 } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ErrorBanner } from "@/components/ui/error-banner"
import { toast } from "sonner"

interface DropSeason {
  id: string
  division: "mens" | "womens"
  name: string
  slug: string
  startDate: string
  endDate: string
  sessionDay: number
  maxPlayers: number | null
  status: string
  playerCount: number
}

const statusOptions = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "open", label: "Open", color: "bg-green-100 text-green-700" },
  { value: "active", label: "Active", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", color: "bg-purple-100 text-purple-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
]

const SESSION_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function DropSeasonsList() {
  useHydrationBeacon()
  const [seasons, setSeasons] = useState<DropSeason[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    division: "mens" as "mens" | "womens",
    name: "",
    slug: "",
    startDate: "",
    endDate: "",
    maxPlayers: "",
    status: "draft",
  })

  useEffect(() => {
    fetchSeasons()
  }, [])

  async function fetchSeasons() {
    try {
      const res = await fetch("/api/admin/drop-seasons")
      if (!res.ok) throw new Error("Failed to fetch drop seasons")
      const data = await res.json()
      setSeasons(data.seasons)
    } catch (err) {
      toast.error("Failed to load drop seasons")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    const today = new Date().toISOString().split("T")[0]
    setFormData({
      division: "mens",
      name: "",
      slug: "",
      startDate: today,
      endDate: today,
      maxPlayers: "",
      status: "draft",
    })
    setFormError(null)
    setIsDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      const body = {
        division: formData.division,
        name: formData.name,
        slug: formData.slug,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maxPlayers: formData.maxPlayers ? parseInt(formData.maxPlayers) : null,
        status: formData.status,
      }

      const res = await fetch("/api/admin/drop-seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create drop season")

      await fetchSeasons()
      setIsDialogOpen(false)
      toast.success(`Created "${formData.name}"`)
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
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
          <h1 className="text-3xl font-bold text-gray-900">Drop League</h1>
          <p className="text-gray-600 mt-1">Manage drop league seasons</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Season
        </Button>
      </div>

      {seasons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No drop seasons created yet</p>
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
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{season.name}</h3>
                        <Badge className={statusConfig?.color ?? "bg-gray-100 text-gray-700"}>
                          {statusConfig?.label ?? season.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {season.division === "mens" ? "Men's" : "Women's"} ·{" "}
                        {SESSION_DAYS[season.sessionDay]}s ·{" "}
                        {formatDate(season.startDate)} – {formatDate(season.endDate)}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{season.playerCount} player{season.playerCount !== 1 ? "s" : ""}</p>
                      {season.maxPlayers && (
                        <p>of {season.maxPlayers} max</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Drop Season</DialogTitle>
            <DialogDescription>Create a new drop league season</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <ErrorBanner message={formError} onDismiss={() => setFormError(null)} className="mb-4" />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Division *</Label>
                <Select
                  value={formData.division}
                  onValueChange={(v: "mens" | "womens") =>
                    setFormData((prev) => ({ ...prev, division: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mens">Men's</SelectItem>
                    <SelectItem value="womens">Women's</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ds-name">Season Name *</Label>
                  <Input
                    id="ds-name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Summer 2026"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ds-slug">Slug *</Label>
                  <Input
                    id="ds-slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, slug: e.target.value }))
                    }
                    placeholder="summer-2026"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ds-start">Start Date *</Label>
                  <Input
                    id="ds-start"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ds-end">End Date *</Label>
                  <Input
                    id="ds-end"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ds-max">Max Players</Label>
                  <Input
                    id="ds-max"
                    type="number"
                    min="1"
                    value={formData.maxPlayers}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, maxPlayers: e.target.value }))
                    }
                    placeholder="20"
                  />
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
                      {statusOptions.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Season
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
