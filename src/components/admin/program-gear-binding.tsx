"use client"

import { useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

interface Product {
  id: string
  name: string
  basePriceCents: number
  active: boolean
}

interface Binding {
  id: string
  productId: string
  programId: string | null
  seasonId: string | null
  required: boolean
  priceCents: number | null
  sortOrder: number
}

interface FormState {
  productId: string
  required: boolean
  priceOverrideDollarsString: string
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  productId: "",
  required: false,
  priceOverrideDollarsString: "",
  sortOrder: 0,
}

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function parseDollarsOrNull(str: string): number | null {
  const trimmed = str.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

interface Props {
  programId?: string
  seasonId?: string
}

export function ProgramGearBinding({ programId, seasonId }: Props) {
  if ((!programId && !seasonId) || (programId && seasonId)) {
    throw new Error(
      "ProgramGearBinding: exactly one of programId or seasonId must be set",
    )
  }

  const scopeParam = programId
    ? `programId=${programId}`
    : `seasonId=${seasonId}`

  const [bindings, setBindings] = useState<Binding[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingBinding, setEditingBinding] = useState<Binding | null>(null)
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    Promise.all([fetchBindings(), fetchProducts()]).finally(() =>
      setIsLoading(false),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, seasonId])

  async function fetchBindings() {
    try {
      const res = await fetch(`/api/admin/program-gear?${scopeParam}`)
      if (!res.ok) throw new Error("Failed to fetch bindings")
      const data = await res.json()
      setBindings(data.bindings)
    } catch (err) {
      setError("Failed to load gear bindings")
      console.error(err)
    }
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/admin/products")
      if (!res.ok) throw new Error("Failed to fetch products")
      const data = await res.json()
      setProducts(data.products)
    } catch (err) {
      console.error(err)
    }
  }

  function openCreateDialog() {
    setEditingBinding(null)
    setFormData({
      ...EMPTY_FORM,
      productId: products[0]?.id ?? "",
      sortOrder: bindings.length,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(binding: Binding) {
    setEditingBinding(binding)
    setFormData({
      productId: binding.productId,
      required: binding.required,
      priceOverrideDollarsString:
        binding.priceCents != null ? formatDollars(binding.priceCents) : "",
      sortOrder: binding.sortOrder,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.productId) {
      setError("Pick a product")
      return
    }
    setIsSubmitting(true)
    setError(null)

    try {
      const method = editingBinding ? "PUT" : "POST"
      const payload = {
        productId: formData.productId,
        programId: programId ?? null,
        seasonId: seasonId ?? null,
        required: formData.required,
        priceCents: parseDollarsOrNull(formData.priceOverrideDollarsString),
        sortOrder: formData.sortOrder,
      }
      const body = editingBinding
        ? { id: editingBinding.id, ...payload }
        : payload

      const res = await fetch("/api/admin/program-gear", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save binding")
      }

      await fetchBindings()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(binding: Binding) {
    const product = products.find((p) => p.id === binding.productId)
    const label = product?.name ?? "this binding"
    if (!confirm(`Remove "${label}" from this gear list?`)) return

    try {
      const res = await fetch(
        `/api/admin/program-gear?id=${binding.id}`,
        { method: "DELETE" },
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete binding")
      }
      await fetchBindings()
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const productById = new Map(products.map((p) => [p.id, p]))
  const sorted = [...bindings].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Products offered or required for this{" "}
          {programId ? "program" : "season"}.
        </p>
        <Button
          onClick={openCreateDialog}
          size="sm"
          disabled={products.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-muted-foreground text-sm">
          Create at least one product in the{" "}
          <a href="/admin/gear/products" className="underline">
            catalog
          </a>{" "}
          before adding gear bindings.
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border py-8 text-center text-muted-foreground text-sm">
          No gear bound yet. Add a product to offer it with this{" "}
          {programId ? "program" : "season"}.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Required</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const product = productById.get(b.productId)
                const price = b.priceCents ?? product?.basePriceCents ?? 0
                const isOverride = b.priceCents != null
                return (
                  <tr key={b.id} className="border-t">
                    <td className="px-4 py-2 font-medium">
                      {product?.name ?? "Unknown product"}
                      {product && !product.active && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (inactive)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {b.required ? (
                        <span className="text-amber-700">Required</span>
                      ) : (
                        <span className="text-muted-foreground">Optional</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      ${formatDollars(price)}
                      {isOverride && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (override)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {b.sortOrder}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(b)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(b)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBinding ? "Edit Gear Binding" : "Add Gear"}
            </DialogTitle>
            <DialogDescription>
              Pick a product to offer with this{" "}
              {programId ? "program" : "season"}. The same product can't be
              bound twice.
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
                <Label htmlFor="productId">Product *</Label>
                <Select
                  value={formData.productId}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, productId: v }))
                  }
                >
                  <SelectTrigger id="productId">
                    <SelectValue placeholder="Pick a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · ${formatDollars(p.basePriceCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priceOverride">Price override (USD)</Label>
                <Input
                  id="priceOverride"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.priceOverrideDollarsString}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      priceOverrideDollarsString: e.target.value,
                    }))
                  }
                  placeholder="Leave blank to use base price"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min={0}
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sortOrder: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="required"
                  checked={formData.required}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      required: checked === true,
                    }))
                  }
                />
                <Label htmlFor="required" className="font-normal">
                  Required (added automatically during registration)
                </Label>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingBinding ? (
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
