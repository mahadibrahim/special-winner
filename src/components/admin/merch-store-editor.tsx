"use client"

import { useEffect, useState, useCallback, useRef, type KeyboardEvent } from "react"
import { Plus, Pencil, Trash2, Loader2, X, ArrowLeft, Shirt, Copy, ClipboardList } from "lucide-react"
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
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

const CATEGORIES = [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
] as const

type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  jersey: "Jersey",
  shorts: "Shorts",
  socks: "Socks",
  hoodie: "Hoodie",
  t_shirt: "T-shirt",
  hat: "Hat",
  bag: "Bag",
  accessory: "Accessory",
  other: "Other",
}

type FulfillmentType = "pickup" | "self_shipped" | "digital"

const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  pickup: "Pickup (org hands it out on-site)",
  self_shipped: "Self-shipped (org packs + ships; admin enters tracking)",
  digital: "Digital (buyer downloads a file — no shipping)",
}

interface MerchVariant {
  id: string
  size: string | null
  retailPriceCents: number
  weightOz: number | null
  lengthIn: number | null
  widthIn: number | null
  heightIn: number | null
}

interface MerchStoreProduct {
  id: string
  name: string
  description: string | null
  category: Category
  images: { url: string; alt?: string }[] | null
  personalization: { name?: boolean; number?: boolean } | null
  active: boolean
  fulfillmentType: FulfillmentType
  digitalAssetKey: string | null
  digitalAssetName: string | null
  variants: MerchVariant[]
}

interface VariantWeightDraft {
  weightOz: string
  lengthIn: string
  widthIn: string
  heightIn: string
}

const EMPTY_WEIGHT_DRAFT: VariantWeightDraft = { weightOz: "", lengthIn: "", widthIn: "", heightIn: "" }

interface StoreSummary {
  id: string
  name: string
  slug: string
  visibility: "public" | "unlisted"
  shareToken: string | null
}

interface ProductFormState {
  name: string
  description: string
  category: Category
  imageUrl: string
  priceDollars: string
  sizes: string[]
  sizeDraft: string
  personalizeName: boolean
  personalizeNumber: boolean
  active: boolean
  fulfillmentType: FulfillmentType
  // Keyed by size — only relevant (and required) when fulfillmentType is
  // self_shipped; see missingSelfShippedWeights in store-products.ts.
  variantWeights: Record<string, VariantWeightDraft>
  // Only relevant (and required) when fulfillmentType is digital — set once
  // the file finishes uploading to R2 via /api/admin/merch/digital-asset-url.
  digitalAssetKey: string | null
  digitalAssetName: string | null
}

const EMPTY_FORM: ProductFormState = {
  name: "",
  description: "",
  category: "jersey",
  imageUrl: "",
  priceDollars: "",
  sizes: [],
  sizeDraft: "",
  personalizeName: false,
  personalizeNumber: false,
  active: true,
  fulfillmentType: "pickup",
  variantWeights: {},
  digitalAssetKey: null,
  digitalAssetName: null,
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`

export function MerchStoreEditor({ storeId }: { storeId: string }) {
  useHydrationBeacon()

  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const [store, setStore] = useState<StoreSummary | null>(null)
  const [products, setProducts] = useState<MerchStoreProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingProduct, setEditingProduct] = useState<MerchStoreProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<ProductFormState>(EMPTY_FORM)
  const [isUploadingAsset, setIsUploadingAsset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [storesRes, productsRes] = await Promise.all([
        fetch("/api/admin/merch/stores"),
        fetch(`/api/admin/merch/store-products?storeId=${storeId}`),
      ])
      if (storesRes.ok) {
        const storesData = await storesRes.json()
        const match = (storesData.stores ?? []).find((s: StoreSummary) => s.id === storeId)
        setStore(match ?? null)
      }
      if (!productsRes.ok) throw new Error("Failed to fetch products")
      const productsData = await productsRes.json()
      setProducts(productsData.products ?? [])
    } catch (err) {
      console.error(err)
      toast.error("Failed to load store products")
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  function openCreateDialog() {
    setEditingProduct(null)
    setFormData(EMPTY_FORM)
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(product: MerchStoreProduct) {
    setEditingProduct(product)
    const priceCents = product.variants[0]?.retailPriceCents ?? 0
    const variantWeights: Record<string, VariantWeightDraft> = {}
    for (const v of product.variants) {
      if (!v.size) continue
      variantWeights[v.size] = {
        weightOz: v.weightOz != null ? String(v.weightOz) : "",
        lengthIn: v.lengthIn != null ? String(v.lengthIn) : "",
        widthIn: v.widthIn != null ? String(v.widthIn) : "",
        heightIn: v.heightIn != null ? String(v.heightIn) : "",
      }
    }
    setFormData({
      name: product.name,
      description: product.description ?? "",
      category: product.category,
      imageUrl: product.images?.[0]?.url ?? "",
      priceDollars: priceCents ? (priceCents / 100).toFixed(2) : "",
      sizes: product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)),
      sizeDraft: "",
      personalizeName: Boolean(product.personalization?.name),
      personalizeNumber: Boolean(product.personalization?.number),
      active: product.active,
      fulfillmentType: product.fulfillmentType ?? "pickup",
      variantWeights,
      digitalAssetKey: product.digitalAssetKey ?? null,
      digitalAssetName: product.digitalAssetName ?? null,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  function addSizes() {
    const raw = formData.sizeDraft.trim()
    if (!raw) return
    const next = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setFormData((prev) => {
      const sizes = Array.from(new Set([...prev.sizes, ...next]))
      const variantWeights = { ...prev.variantWeights }
      for (const size of next) {
        if (!variantWeights[size]) variantWeights[size] = { ...EMPTY_WEIGHT_DRAFT }
      }
      return { ...prev, sizes, sizeDraft: "", variantWeights }
    })
  }

  function removeSize(size: string) {
    setFormData((prev) => {
      const variantWeights = { ...prev.variantWeights }
      delete variantWeights[size]
      return { ...prev, sizes: prev.sizes.filter((s) => s !== size), variantWeights }
    })
  }

  function updateVariantWeight(size: string, patch: Partial<VariantWeightDraft>) {
    setFormData((prev) => ({
      ...prev,
      variantWeights: {
        ...prev.variantWeights,
        [size]: { ...(prev.variantWeights[size] ?? EMPTY_WEIGHT_DRAFT), ...patch },
      },
    }))
  }

  function handleSizeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addSizes()
    }
  }

  async function handleDigitalFileSelect(file: File) {
    setIsUploadingAsset(true)
    setError(null)
    try {
      const presignRes = await fetch("/api/admin/merch/digital-asset-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error || "Failed to get an upload URL")

      const putRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!putRes.ok) throw new Error("File upload failed")

      setFormData((prev) => ({
        ...prev,
        digitalAssetKey: presignData.key,
        digitalAssetName: file.name,
      }))
      toast.success("File uploaded")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "File upload failed")
    } finally {
      setIsUploadingAsset(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const isDigital = formData.fulfillmentType === "digital"

    if (!isDigital && formData.sizes.length === 0) {
      setError("Add at least one size")
      return
    }
    if (isDigital && !formData.digitalAssetKey) {
      setError("Upload a file for this digital product")
      return
    }
    const priceCents = Math.round(parseFloat(formData.priceDollars) * 100)
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError("Enter a valid price")
      return
    }

    let variantWeights: { size: string; weightOz: number; lengthIn?: number; widthIn?: number; heightIn?: number }[] | undefined
    if (formData.fulfillmentType === "self_shipped") {
      const missing: string[] = []
      variantWeights = formData.sizes.map((size) => {
        const draft = formData.variantWeights[size] ?? EMPTY_WEIGHT_DRAFT
        const weightOz = Math.round(parseFloat(draft.weightOz))
        if (!Number.isFinite(weightOz) || weightOz <= 0) missing.push(size)
        const lengthIn = draft.lengthIn.trim() ? Math.round(parseFloat(draft.lengthIn)) : undefined
        const widthIn = draft.widthIn.trim() ? Math.round(parseFloat(draft.widthIn)) : undefined
        const heightIn = draft.heightIn.trim() ? Math.round(parseFloat(draft.heightIn)) : undefined
        return { size, weightOz, lengthIn, widthIn, heightIn }
      })
      if (missing.length > 0) {
        setError(`Enter a weight (oz) for: ${missing.join(", ")}`)
        return
      }
    }

    setIsSubmitting(true)
    try {
      const url = "/api/admin/merch/store-products"
      const method = editingProduct ? "PUT" : "POST"
      const body = {
        ...(editingProduct ? { id: editingProduct.id } : {}),
        storeId,
        name: formData.name,
        description: formData.description || null,
        category: formData.category,
        imageUrl: formData.imageUrl || null,
        priceCents,
        fulfillmentType: formData.fulfillmentType,
        sizes: isDigital ? [] : formData.sizes,
        ...(variantWeights ? { variantWeights } : {}),
        ...(isDigital
          ? { digitalAssetKey: formData.digitalAssetKey, digitalAssetName: formData.digitalAssetName }
          : {}),
        personalization:
          formData.personalizeName || formData.personalizeNumber
            ? { name: formData.personalizeName, number: formData.personalizeNumber }
            : null,
        active: formData.active,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save product")

      await load()
      setIsDialogOpen(false)
      toast.success(editingProduct ? "Product updated" : "Product added")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(product: MerchStoreProduct) {
    const ok = await confirm({
      title: "Delete product?",
      description: (
        <>
          Delete <strong>{product.name}</strong> from this store? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/merch/store-products?id=${product.id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete product")
      await load()
      toast.success(`Deleted "${product.name}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product")
    }
  }

  function copyShareLink() {
    if (!store) return
    const qs = store.visibility === "unlisted" && store.shareToken ? `?k=${store.shareToken}` : ""
    const url = `${window.location.origin}/shop/${store.slug}${qs}`
    navigator.clipboard.writeText(url)
    toast.success("Share link copied")
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
      <div>
        <a
          href="/admin/merch/stores"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to stores
        </a>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {store ? `${store.name} — products` : "Store products"}
          </h1>
          <p className="text-gray-600 mt-1">
            Manual products (jerseys, hoodies, etc.) for this store — sized, priced, and picked up
            on-site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {store && (
            <Button variant="outline" onClick={copyShareLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copy link
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={`/admin/merch/stores/${storeId}/orders`}>
              <ClipboardList className="h-4 w-4 mr-2" />
              Orders
            </a>
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add product
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shirt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No products yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add first product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((product) => {
            const priceCents = product.variants[0]?.retailPriceCents ?? 0
            return (
              <Card key={product.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0">
                        {product.images?.[0]?.url && (
                          <img
                            src={product.images[0].url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{product.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {CATEGORY_LABELS[product.category]} · {money(priceCents)}
                        </p>
                      </div>
                    </div>
                    <Badge className={product.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {product.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1 mb-3">
                    {product.variants.map((v) => (
                      <Badge key={v.id} variant="secondary">
                        {v.size}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {product.personalization?.name && <Badge variant="outline">Name</Badge>}
                      {product.personalization?.number && <Badge variant="outline">Number</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product)}>
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
            <DialogTitle>{editingProduct ? "Edit product" : "Add product"}</DialogTitle>
            <DialogDescription>
              {editingProduct ? "Update this store product" : "Add a manual product to this store"}
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
                <Label htmlFor="product-name">Name</Label>
                <Input
                  id="product-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Home Jersey"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, category: value as Category }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceDollars}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, priceDollars: e.target.value }))
                    }
                    placeholder="45.00"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-description">Description (optional)</Label>
                <Textarea
                  id="product-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Home jersey, moisture-wicking fabric"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL (optional)</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>

              <div className="space-y-2">
                <Label>Fulfillment</Label>
                <Select
                  value={formData.fulfillmentType}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, fulfillmentType: value as FulfillmentType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FULFILLMENT_LABELS) as FulfillmentType[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {FULFILLMENT_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.fulfillmentType === "digital" ? (
                <div className="space-y-2">
                  <Label>File</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleDigitalFileSelect(file)
                      e.target.value = ""
                    }}
                  />
                  {formData.digitalAssetName ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span className="truncate">{formData.digitalAssetName}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingAsset}
                      >
                        {isUploadingAsset ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Replace file"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAsset}
                    >
                      {isUploadingAsset ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload file"
                      )}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Buyers get a secure, time-limited download link after payment.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sizeDraft">Sizes</Label>
                    <div className="flex gap-2">
                      <Input
                        id="sizeDraft"
                        value={formData.sizeDraft}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, sizeDraft: e.target.value }))
                        }
                        onKeyDown={handleSizeKeyDown}
                        placeholder="S, M, L, XL"
                      />
                      <Button type="button" variant="outline" onClick={addSizes}>
                        Add
                      </Button>
                    </div>
                    {formData.sizes.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {formData.sizes.map((size) => (
                          <Badge key={size} variant="secondary" className="gap-1">
                            {size}
                            <button
                              type="button"
                              onClick={() => removeSize(size)}
                              className="hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {formData.fulfillmentType === "self_shipped" && formData.sizes.length > 0 && (
                    <div className="space-y-2">
                      <Label>Per-size weight (oz) — required for shipping rates</Label>
                      <div className="space-y-2">
                        {formData.sizes.map((size) => {
                          const draft = formData.variantWeights[size] ?? EMPTY_WEIGHT_DRAFT
                          return (
                            <div key={size} className="flex items-center gap-2">
                              <Badge variant="secondary" className="w-14 justify-center shrink-0">
                                {size}
                              </Badge>
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={draft.weightOz}
                                onChange={(e) => updateVariantWeight(size, { weightOz: e.target.value })}
                                placeholder="Weight (oz) *"
                                required
                              />
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={draft.lengthIn}
                                onChange={(e) => updateVariantWeight(size, { lengthIn: e.target.value })}
                                placeholder="L (in)"
                              />
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={draft.widthIn}
                                onChange={(e) => updateVariantWeight(size, { widthIn: e.target.value })}
                                placeholder="W (in)"
                              />
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={draft.heightIn}
                                onChange={(e) => updateVariantWeight(size, { heightIn: e.target.value })}
                                placeholder="H (in)"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Personalization</Label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="personalizeName"
                      checked={formData.personalizeName}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, personalizeName: checked === true }))
                      }
                    />
                    <Label htmlFor="personalizeName" className="font-normal">
                      Name
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="personalizeNumber"
                      checked={formData.personalizeNumber}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, personalizeNumber: checked === true }))
                      }
                    />
                    <Label htmlFor="personalizeNumber" className="font-normal">
                      Number
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="product-active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, active: checked === true }))
                  }
                />
                <Label htmlFor="product-active" className="font-normal">
                  Active (visible on the store order page)
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
                  isSubmitting ||
                  isUploadingAsset ||
                  (formData.fulfillmentType === "digital" && !formData.digitalAssetKey)
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingProduct ? (
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
