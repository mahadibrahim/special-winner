"use client"

import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, Download, Loader2, PackageCheck, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "sonner"
import { buildOrdersCsv, type CsvRow } from "@/lib/merch/order-csv"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

interface OrderItem {
  id: string
  productName: string
  size: string | null
  personalization: { name?: string; number?: string } | null
  quantity: number
  fulfillmentType: string
}

interface Order {
  id: string
  email: string
  status: string
  shippingAddress: { name: string } | null
  totalCents: number
  createdAt: string
  items: OrderItem[]
  shippingCarrier: string | null
  shippingService: string | null
  trackingNumber: string | null
}

interface TrackingDraft {
  trackingNumber: string
  carrier: string
  service: string
  trackingUrl: string
}

const EMPTY_TRACKING_DRAFT: TrackingDraft = { trackingNumber: "", carrier: "", service: "", trackingUrl: "" }

/** An order is self-shipped only when every line is self_shipped — mirrors
 * `orderFulfillmentPlan` in src/lib/merch/fulfillment.ts. Mixed/pickup/printful
 * orders never show the "Mark shipped" action here. */
function isSelfShippedOrder(order: Order): boolean {
  return order.items.length > 0 && order.items.every((i) => i.fulfillmentType === "self_shipped")
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  submitted: "Submitted",
  shipped: "Shipped",
  cancelled: "Cancelled",
  failed: "Failed",
  awaiting_pickup: "Awaiting pickup",
  collected: "Collected",
}

const STATUS_BADGE: Record<string, string> = {
  awaiting_pickup: "bg-amber-100 text-amber-800",
  collected: "bg-green-100 text-green-800",
  shipped: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`

export function MerchStoreOrders({ storeId }: { storeId: string }) {
  useHydrationBeacon()

  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [shippingId, setShippingId] = useState<string | null>(null)
  const [trackingFormOrderId, setTrackingFormOrderId] = useState<string | null>(null)
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, TrackingDraft>>({})

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/merch/orders?storeId=${storeId}`)
      if (!res.ok) throw new Error("Failed to fetch orders")
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch (err) {
      console.error(err)
      toast.error("Failed to load orders")
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    load()
  }, [load])

  function downloadCsv() {
    const rows: CsvRow[] = orders.flatMap((order) =>
      order.items.map((item) => ({
        email: order.email,
        productName: item.productName,
        size: item.size,
        personalization: item.personalization,
        quantity: item.quantity,
        status: order.status,
        carrier: order.shippingCarrier,
        service: order.shippingService,
        trackingNumber: order.trackingNumber,
      })),
    )
    const csv = buildOrdersCsv(rows)
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `orders-${storeId}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function markCollected(order: Order) {
    setCollectingId(order.id)
    try {
      const res = await fetch("/api/admin/merch/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, status: "collected" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to mark collected")
      await load()
      toast.success("Order marked collected")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark collected")
    } finally {
      setCollectingId(null)
    }
  }

  function openTrackingForm(orderId: string) {
    setTrackingFormOrderId(orderId)
    setTrackingDrafts((prev) => ({ ...prev, [orderId]: prev[orderId] ?? EMPTY_TRACKING_DRAFT }))
  }

  function updateTrackingDraft(orderId: string, patch: Partial<TrackingDraft>) {
    setTrackingDrafts((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] ?? EMPTY_TRACKING_DRAFT), ...patch } }))
  }

  async function markShipped(order: Order) {
    const draft = trackingDrafts[order.id] ?? EMPTY_TRACKING_DRAFT
    const trackingNumber = draft.trackingNumber.trim()
    if (!trackingNumber) {
      toast.error("Enter a tracking number")
      return
    }
    setShippingId(order.id)
    try {
      const res = await fetch("/api/admin/merch/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          status: "shipped",
          trackingNumber,
          ...(draft.trackingUrl.trim() ? { trackingUrl: draft.trackingUrl.trim() } : {}),
          ...(draft.carrier.trim() ? { carrier: draft.carrier.trim() } : {}),
          ...(draft.service.trim() ? { service: draft.service.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to mark shipped")
      await load()
      setTrackingFormOrderId(null)
      setTrackingDrafts((prev) => {
        const next = { ...prev }
        delete next[order.id]
        return next
      })
      toast.success("Order marked shipped")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark shipped")
    } finally {
      setShippingId(null)
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
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600 mt-1">Buyers, items, and pickup status for this store.</p>
        </div>
        <Button variant="outline" onClick={downloadCsv} disabled={orders.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Download CSV
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders will show up here once buyers check out." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {order.shippingAddress?.name ?? order.email}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{order.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_BADGE[order.status] ?? "bg-gray-100 text-gray-800"}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                    {order.status === "awaiting_pickup" && (
                      <Button
                        size="sm"
                        onClick={() => markCollected(order)}
                        disabled={collectingId === order.id}
                      >
                        {collectingId === order.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <PackageCheck className="h-4 w-4 mr-2" />
                        )}
                        Mark collected
                      </Button>
                    )}
                    {order.status === "paid" && isSelfShippedOrder(order) && trackingFormOrderId !== order.id && (
                      <Button size="sm" variant="outline" onClick={() => openTrackingForm(order.id)}>
                        <Truck className="h-4 w-4 mr-2" />
                        Mark shipped
                      </Button>
                    )}
                  </div>
                </div>
                {trackingFormOrderId === order.id && (
                  <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Tracking number *"
                        value={trackingDrafts[order.id]?.trackingNumber ?? ""}
                        onChange={(e) => updateTrackingDraft(order.id, { trackingNumber: e.target.value })}
                      />
                      <Input
                        placeholder="Carrier (optional)"
                        value={trackingDrafts[order.id]?.carrier ?? ""}
                        onChange={(e) => updateTrackingDraft(order.id, { carrier: e.target.value })}
                      />
                      <Input
                        placeholder="Service (optional)"
                        value={trackingDrafts[order.id]?.service ?? ""}
                        onChange={(e) => updateTrackingDraft(order.id, { service: e.target.value })}
                      />
                      <Input
                        placeholder="Tracking URL (optional)"
                        value={trackingDrafts[order.id]?.trackingUrl ?? ""}
                        onChange={(e) => updateTrackingDraft(order.id, { trackingUrl: e.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => markShipped(order)} disabled={shippingId === order.id}>
                        {shippingId === order.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Truck className="h-4 w-4 mr-2" />
                        )}
                        Confirm shipped
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setTrackingFormOrderId(null)}
                        disabled={shippingId === order.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="text-sm space-y-1">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}× {item.productName}
                        {item.size ? ` (${item.size})` : ""}
                        {item.personalization?.name ? ` — ${item.personalization.name}` : ""}
                        {item.personalization?.number ? ` #${item.personalization.number}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground mt-2">Total: {money(order.totalCents)}</p>
                {order.status === "shipped" && order.trackingNumber && (
                  <p className="text-sm text-muted-foreground">
                    Tracking: {[order.shippingCarrier, order.shippingService].filter(Boolean).join(" · ")}
                    {order.shippingCarrier || order.shippingService ? " — " : ""}
                    {order.trackingNumber}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
