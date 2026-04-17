"use client"

import { useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Variant {
  id: string
  productId: string
  sku: string | null
  size: string
  color: string | null
  priceOverrideCents: number | null
  active: boolean
  sortOrder: number
}

interface FormState {
  sku: string
  size: string
  color: string
  priceOverrideDollarsString: string
  active: boolean
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  sku: "",
  size: "",
  color: "",
  priceOverrideDollarsString: "",
  active: true,
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
  productId: string
  basePriceCents: number
}

export function ProductVariantsManager({ productId, basePriceCents }: Props) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null)
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    fetchVariants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  async function fetchVariants() {
    try {
      const res = await fetch(
        `/api/admin/product-variants?productId=${productId}`,
      )
      if (!res.ok) throw new Error("Failed to fetch variants")
      const data = await res.json()
      setVariants(data.variants)
    } catch (err) {
      setError("Failed to load variants")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingVariant(null)
    setFormData({ ...EMPTY_FORM, sortOrder: variants.length })
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(variant: Variant) {
    setEditingVariant(variant)
    setFormData({
      sku: variant.sku ?? "",
      size: variant.size,
      color: variant.color ?? "",
      priceOverrideDollarsString:
        variant.priceOverrideCents != null
          ? formatDollars(variant.priceOverrideCents)
          : "",
      active: variant.active,
      sortOrder: variant.sortOrder,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        productId,
        sku: formData.sku.trim() || null,
        size: formData.size.trim(),
        color: formData.color.trim() || null,
        priceOverrideCents: parseDollarsOrNull(
          formData.priceOverrideDollarsString,
        ),
        active: formData.active,
        sortOrder: formData.sortOrder,
      }

      const method = editingVariant ? "PUT" : "POST"
      const body = editingVariant
        ? { id: editingVariant.id, ...payload }
        : payload

      const res = await fetch("/api/admin/product-variants", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save variant")
      }

      await fetchVariants()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(variant: Variant) {
    const label = variant.color
      ? `${variant.size} / ${variant.color}`
      : variant.size
    if (!confirm(`Delete variant "${label}"?`)) return

    try {
      const res = await fetch(
        `/api/admin/product-variants?id=${variant.id}`,
        { method: "DELETE" },
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete variant")
      }
      await fetchVariants()
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

  const sorted = [...variants].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    if (a.size !== b.size) return a.size.localeCompare(b.size)
    return (a.color ?? "").localeCompare(b.color ?? "")
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Variant
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-muted-foreground">
          No variants yet. Add at least one to start selling.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Color</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => {
                const effectivePriceCents =
                  v.priceOverrideCents ?? basePriceCents
                const isOverride = v.priceOverrideCents != null
                return (
                  <tr key={v.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{v.size}</td>
                    <td className="px-4 py-2">{v.color || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {v.sku || "—"}
                    </td>
                    <td className="px-4 py-2">
                      ${formatDollars(effectivePriceCents)}
                      {isOverride && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (override)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          v.active ? "text-green-600" : "text-gray-500"
                        }
                      >
                        {v.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(v)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(v)}
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
              {editingVariant ? "Edit Variant" : "Add Variant"}
            </DialogTitle>
            <DialogDescription>
              Size and color (optional) must be unique within this product.
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
                  <Label htmlFor="size">Size *</Label>
                  <Input
                    id="size"
                    value={formData.size}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, size: e.target.value }))
                    }
                    placeholder="YM"
                    maxLength={20}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Input
                    id="color"
                    value={formData.color}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        color: e.target.value,
                      }))
                    }
                    placeholder="Red"
                    maxLength={40}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, sku: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priceOverride">
                    Price override (USD)
                  </Label>
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
                    placeholder={`Base $${formatDollars(basePriceCents)}`}
                  />
                </div>
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
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      active: checked === true,
                    }))
                  }
                />
                <Label htmlFor="active" className="font-normal">
                  Active (buyable)
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
                ) : editingVariant ? (
                  "Update Variant"
                ) : (
                  "Add Variant"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
