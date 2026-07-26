"use client"

import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, Download, Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
}

interface Order {
  id: string
  email: string
  status: string
  shippingAddress: { name: string } | null
  totalCents: number
  createdAt: string
  items: OrderItem[]
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
  cancelled: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
}

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`

export function MerchStoreOrders({ storeId }: { storeId: string }) {
  useHydrationBeacon()

  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [collectingId, setCollectingId] = useState<string | null>(null)

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
                  </div>
                </div>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
