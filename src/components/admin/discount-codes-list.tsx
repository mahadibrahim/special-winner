"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Tag, Percent, DollarSign, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
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

interface DiscountCode {
  id: string
  code: string
  description: string | null
  discountType: string
  discountValue: number
  minPurchaseCents: number | null
  maxDiscountCents: number | null
  maxUses: number | null
  usedCount: number
  maxUsesPerUser: number | null
  seasonId: string | null
  active: boolean
  startsAt: string | null
  expiresAt: string | null
  createdAt: string
}

export function DiscountCodesList() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: 10,
    minPurchaseCents: "",
    maxDiscountCents: "",
    maxUses: "",
    maxUsesPerUser: 1,
    active: true,
    startsAt: "",
    expiresAt: "",
  })

  useEffect(() => {
    fetchDiscountCodes()
  }, [])

  async function fetchDiscountCodes() {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/discount-codes")
      if (!response.ok) throw new Error("Failed to fetch discount codes")
      const data = await response.json()
      setDiscountCodes(data.discountCodes)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingCode(null)
    setFormData({
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: 10,
      minPurchaseCents: "",
      maxDiscountCents: "",
      maxUses: "",
      maxUsesPerUser: 1,
      active: true,
      startsAt: "",
      expiresAt: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(code: DiscountCode) {
    setEditingCode(code)
    setFormData({
      code: code.code,
      description: code.description || "",
      discountType: code.discountType,
      discountValue: code.discountValue,
      minPurchaseCents: code.minPurchaseCents?.toString() || "",
      maxDiscountCents: code.maxDiscountCents?.toString() || "",
      maxUses: code.maxUses?.toString() || "",
      maxUsesPerUser: code.maxUsesPerUser || 1,
      active: code.active,
      startsAt: code.startsAt ? new Date(code.startsAt).toISOString().slice(0, 16) : "",
      expiresAt: code.expiresAt ? new Date(code.expiresAt).toISOString().slice(0, 16) : "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/discount-codes"
      const method = editingCode ? "PUT" : "POST"
      const body = {
        ...(editingCode ? { id: editingCode.id } : {}),
        code: formData.code.toUpperCase(),
        description: formData.description || null,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        minPurchaseCents: formData.minPurchaseCents ? parseInt(formData.minPurchaseCents) : null,
        maxDiscountCents: formData.maxDiscountCents ? parseInt(formData.maxDiscountCents) : null,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
        maxUsesPerUser: formData.maxUsesPerUser,
        active: formData.active,
        startsAt: formData.startsAt ? new Date(formData.startsAt).toISOString() : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save discount code")
      }

      await fetchDiscountCodes()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(code: DiscountCode) {
    const ok = await confirm({
      title: "Delete discount code?",
      description: <>Delete the code <strong>{code.code}</strong>? This cannot be undone.</>,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/discount-codes?id=${code.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete discount code")
      }

      await fetchDiscountCodes()
      toast.success(`Deleted code "${code.code}"`)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete discount code")
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
  }

  function formatDiscount(code: DiscountCode) {
    if (code.discountType === "percentage") {
      return `${code.discountValue}% off`
    }
    // The API already decodes storage cents → dollars (decodeDiscountValue);
    // dividing again here showed $25 codes as "$0.25 off" — and while the
    // WFF codes were broken at 100× ($2,500), the double-divide displayed
    // them as the intended "$25.00", hiding the incident. Display verbatim.
    return `$${code.discountValue.toFixed(2)} off`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function getCodeStatus(code: DiscountCode) {
    if (!code.active) return { label: "Inactive", color: "bg-gray-100 text-gray-800" }
    const now = new Date()
    if (code.startsAt && new Date(code.startsAt) > now) {
      return { label: "Scheduled", color: "bg-blue-100 text-blue-800" }
    }
    if (code.expiresAt && new Date(code.expiresAt) < now) {
      return { label: "Expired", color: "bg-red-100 text-red-800" }
    }
    if (code.maxUses && code.usedCount >= code.maxUses) {
      return { label: "Exhausted", color: "bg-yellow-100 text-yellow-800" }
    }
    return { label: "Active", color: "bg-green-100 text-green-800" }
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
          <h1 className="text-3xl font-bold text-gray-900">Discount Codes</h1>
          <p className="text-gray-600 mt-1">Create and manage promotional discount codes</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Code
        </Button>
      </div>

      {discountCodes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No discount codes yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Code
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {discountCodes.map((code) => {
            const status = getCodeStatus(code)
            return (
              <Card key={code.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {code.discountType === "percentage" ? (
                          <Percent className="h-5 w-5 text-primary" />
                        ) : (
                          <DollarSign className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg font-mono flex items-center gap-2">
                          {code.code}
                          <button
                            onClick={() => copyCode(code.code)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </CardTitle>
                        <CardDescription>{formatDiscount(code)}</CardDescription>
                      </div>
                    </div>
                    <Badge className={status.color}>{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {code.description && (
                    <p className="text-sm text-muted-foreground mb-2">{code.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground space-y-1 mb-3">
                    <p>
                      Used: {code.usedCount} / {code.maxUses || "∞"}
                    </p>
                    {code.expiresAt && <p>Expires: {formatDate(code.expiresAt)}</p>}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(code)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(code)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Discount Code Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Edit Discount Code" : "Create Discount Code"}</DialogTitle>
            <DialogDescription>
              {editingCode ? "Update the discount code details" : "Create a new promotional discount code"}
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
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="SUMMER2024"
                  required
                  className="font-mono uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Summer promotion discount"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <Select
                    value={formData.discountType}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, discountType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    {formData.discountType === "percentage" ? "Percentage" : "Amount (cents)"}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData((prev) => ({ ...prev, discountValue: parseInt(e.target.value) || 0 }))}
                    min={1}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxUses">Max Total Uses</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxUses: e.target.value }))}
                    placeholder="Unlimited"
                    min={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUsesPerUser">Max Per User</Label>
                  <Input
                    id="maxUsesPerUser"
                    type="number"
                    value={formData.maxUsesPerUser}
                    onChange={(e) => setFormData((prev) => ({ ...prev, maxUsesPerUser: parseInt(e.target.value) || 1 }))}
                    min={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startsAt">Starts At (optional)</Label>
                  <Input
                    id="startsAt"
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Expires At (optional)</Label>
                  <Input
                    id="expiresAt"
                    type="datetime-local"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, active: checked === true }))}
                />
                <Label htmlFor="active" className="font-normal">
                  Active (code can be used)
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
                ) : editingCode ? (
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
