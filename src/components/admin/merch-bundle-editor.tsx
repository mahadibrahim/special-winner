"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

type DiscountType = "percent" | "fixed"
type FulfillmentType = "pickup" | "self_shipped"

const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  pickup: "Pickup",
  self_shipped: "Self-shipped",
}

interface BundleProductOption {
  id: string
  name: string
  fulfillmentType: FulfillmentType
}

interface BundleItemRow {
  id: string
  productId: string
  label: string | null
  quantity: number
  sortOrder: number
}

interface MerchBundleRow {
  id: string
  name: string
  slug: string
  description: string | null
  images: { url: string; alt?: string }[] | null
  discountType: DiscountType
  discountValue: number
  fulfillmentType: FulfillmentType
  active: boolean
  items: BundleItemRow[]
}

interface ComponentDraft {
  productId: string
  label: string
  quantity: string
}

interface BundleFormState {
  name: string
  description: string
  imageUrl: string
  discountType: DiscountType
  // Dollars-as-string for "fixed" (converted to cents on submit), whole
  // percent-as-string for "percent" — mirrors the price-dollars pattern in
  // merch-store-editor.tsx.
  discountValue: string
  active: boolean
  components: ComponentDraft[]
}

const EMPTY_FORM: BundleFormState = {
  name: "",
  description: "",
  imageUrl: "",
  discountType: "percent",
  discountValue: "",
  active: true,
  components: [],
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`

function discountLabel(bundle: Pick<MerchBundleRow, "discountType" | "discountValue">): string {
  return bundle.discountType === "percent" ? `${bundle.discountValue}% off` : `${money(bundle.discountValue)} off`
}

export function MerchBundleEditor({ storeId }: { storeId: string }) {
  useHydrationBeacon()

  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const [bundles, setBundles] = useState<MerchBundleRow[]>([])
  const [products, setProducts] = useState<BundleProductOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingBundle, setEditingBundle] = useState<MerchBundleRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<BundleFormState>(EMPTY_FORM)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/merch/bundles?storeId=${storeId}`)
      if (!res.ok) throw new Error("Failed to fetch bundles")
      const data = await res.json()
      setBundles(data.bundles ?? [])
      setProducts(data.products ?? [])
    } catch (err) {
      console.error(err)
      toast.error("Failed to load bundles")
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  // Client-side mirror of the endpoint's 422: every component product must
  // share one fulfillment type. Checked against the live `products` list so
  // it stays correct even if a component's product changes type elsewhere.
  const selectedFulfillmentTypes = useMemo(() => {
    const types = new Set<FulfillmentType>()
    for (const c of formData.components) {
      const product = products.find((p) => p.id === c.productId)
      if (product) types.add(product.fulfillmentType)
    }
    return types
  }, [formData.components, products])

  const hasMixedFulfillment = selectedFulfillmentTypes.size > 1

  function openCreateDialog() {
    setEditingBundle(null)
    setFormData(EMPTY_FORM)
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(bundle: MerchBundleRow) {
    setEditingBundle(bundle)
    setFormData({
      name: bundle.name,
      description: bundle.description ?? "",
      imageUrl: bundle.images?.[0]?.url ?? "",
      discountType: bundle.discountType,
      discountValue:
        bundle.discountType === "percent"
          ? String(bundle.discountValue)
          : (bundle.discountValue / 100).toFixed(2),
      active: bundle.active,
      components: bundle.items
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          productId: item.productId,
          label: item.label ?? "",
          quantity: String(item.quantity),
        })),
    })
    setError(null)
    setIsDialogOpen(true)
  }

  function toggleComponent(product: BundleProductOption) {
    setFormData((prev) => {
      const exists = prev.components.some((c) => c.productId === product.id)
      if (exists) {
        return { ...prev, components: prev.components.filter((c) => c.productId !== product.id) }
      }
      return {
        ...prev,
        components: [...prev.components, { productId: product.id, label: "", quantity: "1" }],
      }
    })
  }

  function updateComponent(productId: string, patch: Partial<ComponentDraft>) {
    setFormData((prev) => ({
      ...prev,
      components: prev.components.map((c) => (c.productId === productId ? { ...c, ...patch } : c)),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (formData.components.length === 0) {
      setError("Add at least one component product")
      return
    }
    if (hasMixedFulfillment) {
      setError("All bundle components must share the same fulfillment type (pickup or self-shipped)")
      return
    }

    let discountValue: number
    if (formData.discountType === "percent") {
      discountValue = Math.round(parseFloat(formData.discountValue))
      if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 100) {
        setError("Enter a percent discount between 0 and 100")
        return
      }
    } else {
      discountValue = Math.round(parseFloat(formData.discountValue) * 100)
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        setError("Enter a valid dollar discount amount")
        return
      }
    }

    const components = formData.components.map((c) => {
      const quantity = parseInt(c.quantity, 10)
      return {
        productId: c.productId,
        label: c.label.trim() || null,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      }
    })

    setIsSubmitting(true)
    try {
      const url = "/api/admin/merch/bundles"
      const method = editingBundle ? "PUT" : "POST"
      const body = {
        ...(editingBundle ? { id: editingBundle.id } : {}),
        storeId,
        name: formData.name,
        description: formData.description || null,
        images: formData.imageUrl ? [{ url: formData.imageUrl }] : null,
        discountType: formData.discountType,
        discountValue,
        active: formData.active,
        components,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save bundle")

      await load()
      setIsDialogOpen(false)
      toast.success(editingBundle ? "Bundle updated" : "Bundle added")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bundle")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(bundle: MerchBundleRow) {
    const ok = await confirm({
      title: "Delete bundle?",
      description: (
        <>
          Delete <strong>{bundle.name}</strong>? Past orders keep their own record of what was
          purchased, so this is safe — but the bundle will no longer be sold.
        </>
      ),
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/merch/bundles?id=${bundle.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete bundle")
      await load()
      toast.success(`Deleted "${bundle.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete bundle")
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
    <div className="space-y-6 max-w-4xl">
      {confirmDialog}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bundles</h2>
          <p className="text-gray-600 mt-1">
            Curated multi-product kits sold at a discount off the sum of their parts — e.g. a full
            uniform kit.
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={products.length === 0}>
          <Plus className="h-4 w-4 mr-2" />
          Add bundle
        </Button>
      </div>

      {products.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add at least one product to this store before creating a bundle.
        </p>
      )}

      {bundles.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title="No bundles yet"
              description="Bundle several products together at a discount."
              icon={<Package className="h-12 w-12" />}
            >
              <Button onClick={openCreateDialog} disabled={products.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add first bundle
              </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bundles.map((bundle) => (
            <Card key={bundle.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {bundle.images?.[0]?.url ? (
                        <img
                          src={bundle.images[0].url}
                          alt={bundle.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{bundle.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {discountLabel(bundle)} · {FULFILLMENT_LABELS[bundle.fulfillmentType]}
                      </p>
                    </div>
                  </div>
                  <Badge className={bundle.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                    {bundle.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="text-sm text-muted-foreground space-y-0.5 mb-3">
                  {bundle.items.map((item) => {
                    const product = products.find((p) => p.id === item.productId)
                    return (
                      <li key={item.id}>
                        {item.quantity}× {product?.name ?? "Unknown product"}
                        {item.label ? ` (${item.label})` : ""}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(bundle)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(bundle)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBundle ? "Edit bundle" : "Add bundle"}</DialogTitle>
            <DialogDescription>
              {editingBundle ? "Update this bundle" : "Bundle several products for this store"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <ErrorBanner message={error} />

              <div className="space-y-2">
                <Label htmlFor="bundle-name">Name</Label>
                <Input
                  id="bundle-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Full Uniform Kit"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-description">Description (optional)</Label>
                <Textarea
                  id="bundle-description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Jersey, shorts, and socks — bundled and discounted"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-imageUrl">Image URL (optional)</Label>
                <Input
                  id="bundle-imageUrl"
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount type</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, discountType: value as DiscountType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent off</SelectItem>
                      <SelectItem value="fixed">Fixed amount off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bundle-discountValue">
                    {formData.discountType === "percent" ? "Percent off (0-100)" : "Amount off ($)"}
                  </Label>
                  <Input
                    id="bundle-discountValue"
                    type="number"
                    step={formData.discountType === "percent" ? "1" : "0.01"}
                    min="0"
                    max={formData.discountType === "percent" ? "100" : undefined}
                    value={formData.discountValue}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, discountValue: e.target.value }))
                    }
                    placeholder={formData.discountType === "percent" ? "15" : "10.00"}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Component products</Label>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This store has no products yet — add products before creating a bundle.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto rounded-md border p-2">
                    {products.map((product) => {
                      const selected = formData.components.find((c) => c.productId === product.id)
                      return (
                        <div key={product.id} className="space-y-2 rounded-md p-2 hover:bg-muted/40">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`component-${product.id}`}
                              checked={Boolean(selected)}
                              onCheckedChange={() => toggleComponent(product)}
                            />
                            <Label
                              htmlFor={`component-${product.id}`}
                              className="font-normal flex-1 cursor-pointer truncate"
                            >
                              {product.name}
                            </Label>
                            <Badge variant="outline" className="shrink-0">
                              {FULFILLMENT_LABELS[product.fulfillmentType]}
                            </Badge>
                          </div>
                          {selected && (
                            <div className="grid grid-cols-2 gap-2 pl-6">
                              <Input
                                placeholder="Label (optional, e.g. Top)"
                                value={selected.label}
                                onChange={(e) => updateComponent(product.id, { label: e.target.value })}
                              />
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                placeholder="Quantity"
                                value={selected.quantity}
                                onChange={(e) => updateComponent(product.id, { quantity: e.target.value })}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {hasMixedFulfillment && (
                  <ErrorBanner message="All bundle components must share the same fulfillment type — mixing pickup and self-shipped products isn't supported." />
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="bundle-active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, active: checked === true }))
                  }
                />
                <Label htmlFor="bundle-active" className="font-normal">
                  Active (visible on the store order page)
                </Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || hasMixedFulfillment}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingBundle ? (
                  "Update"
                ) : (
                  "Add"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
