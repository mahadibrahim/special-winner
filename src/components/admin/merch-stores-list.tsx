"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, Pencil, Trash2, Loader2, Store as StoreIcon, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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

type Scope = "general" | "league" | "team"
type Visibility = "public" | "unlisted"

const SCOPE_LABELS: Record<Scope, string> = {
  general: "General",
  league: "League",
  team: "Team",
}

const SCOPE_BADGE_CLASS: Record<Scope, string> = {
  general: "bg-blue-100 text-blue-800",
  league: "bg-purple-100 text-purple-800",
  team: "bg-amber-100 text-amber-800",
}

interface MerchStore {
  id: string
  scope: Scope
  teamId: string | null
  name: string
  slug: string
  description: string | null
  visibility: Visibility
  shareToken: string | null
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
  seasonName: string | null
  programName: string | null
}

interface StoreFormState {
  scope: Scope
  teamId: string
  name: string
  description: string
  visibility: Visibility
  orderOpensAt: string
  orderClosesAt: string
  pickupLocation: string
  active: boolean
}

const EMPTY_FORM: StoreFormState = {
  scope: "team",
  teamId: "",
  name: "",
  description: "",
  visibility: "public",
  orderOpensAt: "",
  orderClosesAt: "",
  pickupLocation: "",
  active: true,
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export function MerchStoresList() {
  useHydrationBeacon()

  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const [stores, setStores] = useState<MerchStore[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingStore, setEditingStore] = useState<MerchStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<StoreFormState>(EMPTY_FORM)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const storesRes = await fetch("/api/admin/merch/stores")
      if (!storesRes.ok) throw new Error("Failed to fetch stores")
      const storesData = await storesRes.json()
      const loadedStores: MerchStore[] = storesData.stores ?? []
      setStores(loadedStores)
      setTeams(storesData.teams ?? [])

      // Product counts are a nice-to-have — fetch in parallel, don't block the list on failures.
      const counts = await Promise.all(
        loadedStores.map(async (store) => {
          try {
            const res = await fetch(`/api/admin/merch/store-products?storeId=${store.id}`)
            if (!res.ok) return [store.id, 0] as const
            const data = await res.json()
            return [store.id, (data.products ?? []).length] as const
          } catch {
            return [store.id, 0] as const
          }
        }),
      )
      setProductCounts(Object.fromEntries(counts))
    } catch (err) {
      console.error(err)
      toast.error("Failed to load stores")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const teamById = new Map(teams.map((t) => [t.id, t]))

  function openCreateDialog() {
    setEditingStore(null)
    setFormData(EMPTY_FORM)
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(store: MerchStore) {
    setEditingStore(store)
    setFormData({
      scope: store.scope,
      teamId: store.teamId ?? "",
      name: store.name,
      description: store.description ?? "",
      visibility: store.visibility,
      orderOpensAt: toDatetimeLocal(store.orderOpensAt),
      orderClosesAt: toDatetimeLocal(store.orderClosesAt),
      pickupLocation: store.pickupLocation ?? "",
      active: store.active,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (formData.scope === "team" && !formData.teamId) {
      setError("Select a team for a team store")
      return
    }

    setIsSubmitting(true)
    try {
      const url = "/api/admin/merch/stores"
      const method = editingStore ? "PUT" : "POST"
      const body = {
        ...(editingStore ? { id: editingStore.id } : {}),
        scope: formData.scope,
        name: formData.name,
        description: formData.description || null,
        visibility: formData.visibility,
        teamId: formData.scope === "team" ? formData.teamId : null,
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
      if (!response.ok) throw new Error(data.error || "Failed to save store")

      await load()
      setIsDialogOpen(false)
      toast.success(editingStore ? "Store updated" : "Store created")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save store")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(store: MerchStore) {
    const ok = await confirm({
      title: "Delete store?",
      description: (
        <>
          Delete the store <strong>{store.name}</strong>? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/merch/stores?id=${store.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete store")
      await load()
      toast.success(`Deleted "${store.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete store")
    }
  }

  function copyShareLink(store: MerchStore) {
    const qs = store.shareToken ? `?k=${store.shareToken}` : ""
    const url = `${window.location.origin}/shop/${store.slug}${qs}`
    navigator.clipboard.writeText(url)
    toast.success("Share link copied")
  }

  function windowLabel(store: MerchStore): string {
    if (!store.orderOpensAt && !store.orderClosesAt) return "No order window set"
    const opens = store.orderOpensAt ? formatDate(store.orderOpensAt) : "now"
    const closes = store.orderClosesAt ? formatDate(store.orderClosesAt) : "no close date"
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
          <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
          <p className="text-gray-600 mt-1">
            Create storefronts scoped to the whole org, a league, or a single team — order
            windows, pickup, and personalization all live here.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New store
        </Button>
      </div>

      {stores.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <StoreIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No stores yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create first store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => {
            const team = store.teamId ? teamById.get(store.teamId) : undefined
            const productCount = productCounts[store.id] ?? 0
            return (
              <Card key={store.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        <a
                          href={`/admin/merch/stores/${store.id}`}
                          className="hover:underline"
                        >
                          {store.name}
                        </a>
                      </CardTitle>
                      <CardDescription>
                        {store.scope === "team"
                          ? team
                            ? `${team.name}${team.seasonName || team.programName ? ` — ${[team.seasonName, team.programName].filter(Boolean).join(" / ")}` : ""}`
                            : "Team not found"
                          : SCOPE_LABELS[store.scope]}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={SCOPE_BADGE_CLASS[store.scope]}>
                        {SCOPE_LABELS[store.scope]}
                      </Badge>
                      <Badge className={store.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {store.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground mb-1">{windowLabel(store)}</p>
                  <p className="text-xs text-muted-foreground mb-1">
                    {productCount} {productCount === 1 ? "product" : "products"}
                  </p>
                  {store.pickupLocation && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Pickup: {store.pickupLocation}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {store.visibility === "unlisted" ? "Unlisted" : "Public"}
                      </Badge>
                      {store.visibility === "unlisted" && (
                        <button
                          type="button"
                          onClick={() => copyShareLink(store)}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" /> link
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`/admin/merch/stores/${store.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(store)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(store)}>
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
            <DialogTitle>{editingStore ? "Edit store" : "New store"}</DialogTitle>
            <DialogDescription>
              {editingStore ? "Update the store details" : "Create a new storefront"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select
                    value={formData.scope}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, scope: value as Scope }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="general">General (org-wide)</SelectItem>
                      <SelectItem value="league">League</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select
                    value={formData.visibility}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, visibility: value as Visibility }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="unlisted">Unlisted (link only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.scope === "team" && (
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
                          {(team.seasonName || team.programName) &&
                            ` (${[team.seasonName, team.programName].filter(Boolean).join(" / ")})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {teams.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No teams found for this organization yet.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="store-name">Store name</Label>
                <Input
                  id="store-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="U12 Thunder Fall Store"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-description">Description (optional)</Label>
                <Textarea
                  id="store-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="A short blurb shown at the top of the store page"
                  rows={2}
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
                  Active (store accepts orders)
                </Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting || !formData.name || (formData.scope === "team" && !formData.teamId)
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingStore ? (
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
