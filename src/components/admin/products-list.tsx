"use client"

import { useEffect, useState } from "react"
import {
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  t_shirt: "T-Shirt",
  hat: "Hat",
  bag: "Bag",
  accessory: "Accessory",
  other: "Other",
}

interface ProductImage {
  url: string
  alt?: string
}

interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  category: Category
  basePriceCents: number
  images: ProductImage[] | null
  availablePostRegistration: boolean
  active: boolean
  sortOrder: number
}

interface FormState {
  name: string
  slug: string
  description: string
  category: Category
  priceDollarsString: string
  imageUrl: string
  imageAlt: string
  availablePostRegistration: boolean
  active: boolean
  sortOrder: number
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  category: "jersey",
  priceDollarsString: "",
  imageUrl: "",
  imageAlt: "",
  availablePostRegistration: true,
  active: true,
  sortOrder: 0,
}

function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function parseDollars(str: string): number {
  const n = parseFloat(str)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

export function ProductsList() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    fetchProducts()
  }, [])

  async function fetchProducts() {
    try {
      const response = await fetch("/api/admin/products")
      if (!response.ok) throw new Error("Failed to fetch products")
      const data = await response.json()
      setProducts(data.products)
    } catch (err) {
      setError("Failed to load products")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingProduct(null)
    setFormData({ ...EMPTY_FORM, sortOrder: products.length })
    setError(null)
    setIsDialogOpen(true)
  }

  function openEditDialog(product: Product) {
    setEditingProduct(product)
    const firstImage = product.images?.[0]
    setFormData({
      name: product.name,
      slug: product.slug,
      description: product.description ?? "",
      category: product.category,
      priceDollarsString: formatDollars(product.basePriceCents),
      imageUrl: firstImage?.url ?? "",
      imageAlt: firstImage?.alt ?? "",
      availablePostRegistration: product.availablePostRegistration,
      active: product.active,
      sortOrder: product.sortOrder,
    })
    setError(null)
    setIsDialogOpen(true)
  }

  function handleNameChange(name: string) {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: editingProduct
        ? prev.slug
        : name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, ""),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/products"
      const method = editingProduct ? "PUT" : "POST"

      const images: ProductImage[] | null = formData.imageUrl
        ? [
            {
              url: formData.imageUrl,
              ...(formData.imageAlt ? { alt: formData.imageAlt } : {}),
            },
          ]
        : null

      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        category: formData.category,
        basePriceCents: parseDollars(formData.priceDollarsString),
        images,
        availablePostRegistration: formData.availablePostRegistration,
        active: formData.active,
        sortOrder: formData.sortOrder,
      }

      const body = editingProduct
        ? { id: editingProduct.id, ...payload }
        : payload

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to save product")
      }

      await fetchProducts()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? Variants will be removed too.`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/products?id=${product.id}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete product")
      }
      await fetchProducts()
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

  const sortedProducts = [...products].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">
            Manage your gear catalog. Each product can have multiple variants
            (sizes, colors).
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {sortedProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No products in the catalog yet
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedProducts.map((product) => {
            const firstImage = product.images?.[0]
            return (
              <Card
                key={product.id}
                className={!product.active ? "opacity-60" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {firstImage?.url ? (
                      <img
                        src={firstImage.url}
                        alt={firstImage.alt ?? product.name}
                        className="w-14 h-14 rounded-lg object-cover border"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">
                        {product.name}
                      </CardTitle>
                      <CardDescription>
                        {CATEGORY_LABELS[product.category]} · $
                        {formatDollars(product.basePriceCents)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span
                      className={
                        product.active ? "text-green-600" : "text-gray-500"
                      }
                    >
                      {product.active ? "Active" : "Inactive"}
                    </span>
                    {product.availablePostRegistration && (
                      <span className="text-muted-foreground">
                        · Post-registration
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <a
                      href={`/admin/gear/products/${product.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage variants →
                    </a>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(product)}
                      >
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Update product details"
                : "Add a new product to your gear catalog"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="U10 Game Jersey"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        slug: e.target.value,
                      }))
                    }
                    placeholder="u10-game-jersey"
                    pattern="[a-z0-9-]+"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Short description shown to parents"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        category: v as Category,
                      }))
                    }
                  >
                    <SelectTrigger id="category">
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
                  <Label htmlFor="price">Base price (USD) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.priceDollarsString}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        priceDollarsString: e.target.value,
                      }))
                    }
                    placeholder="25.00"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      imageUrl: e.target.value,
                    }))
                  }
                  placeholder="https://example.com/jersey.jpg"
                />
              </div>

              {formData.imageUrl && (
                <div className="space-y-2">
                  <Label htmlFor="imageAlt">Image alt text</Label>
                  <Input
                    id="imageAlt"
                    value={formData.imageAlt}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        imageAlt: e.target.value,
                      }))
                    }
                    placeholder="Red game jersey, front view"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sortOrder: parseInt(e.target.value) || 0,
                    }))
                  }
                  min={0}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="availablePostRegistration"
                  checked={formData.availablePostRegistration}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      availablePostRegistration: checked === true,
                    }))
                  }
                />
                <Label
                  htmlFor="availablePostRegistration"
                  className="font-normal"
                >
                  Available after registration closes
                </Label>
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
                  Active (visible in catalog)
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
                ) : editingProduct ? (
                  "Update Product"
                ) : (
                  "Add Product"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
