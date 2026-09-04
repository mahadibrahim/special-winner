"use client"

import { useEffect, useState } from "react"
import {
  CreditCard,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Receipt,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { cn } from "@/lib/utils"
import {
  mapHistoryToSummary,
  type HistoryPaymentRow,
  type PaymentSummaryRow,
} from "@/lib/dashboard/payments-summary-mapping"

/**
 * "Payments" card in the family dashboard's "What you're part of" section
 * (task-10: this used to be a permanent `mockPayments = []` empty state —
 * dishonest now that class families carry real monthly membership charges).
 * Fetches the same `GET /api/payments/history` endpoint `payment-history.tsx`
 * (the full `/dashboard/payments` page) already consumes, mirrors its exact
 * response parsing (`data.payments || []`), and reduces it to the 3 most
 * recent rows via the pure `mapHistoryToSummary` — unit-tested in
 * tests/unit/dashboard/payments-summary-mapping.test.ts since minting a real
 * Stripe-backed payment row in a component test is awkward without a live
 * Stripe fixture (see CI-api-tests-have-no-stripe precedent).
 *
 * Error handling degrades quietly to the same empty state as "zero rows"
 * rather than surfacing an ErrorBanner: this is a summary card buried inside
 * a larger dashboard section, not a page whose job is payments — a fetch
 * blip here shouldn't compete for attention with the rest of "What you're
 * part of". The full history at `/dashboard/payments` (linked below) is
 * still one click away and has its own real error state.
 */

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  succeeded: {
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-500/10",
    label: "Paid",
  },
  pending: {
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-500/10",
    label: "Pending",
  },
  failed: {
    icon: XCircle,
    color: "text-rose-700",
    bg: "bg-rose-500/10",
    label: "Failed",
  },
  refunded: {
    icon: XCircle,
    color: "text-ink-muted",
    bg: "bg-cream-2",
    label: "Refunded",
  },
}

function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function EmptyPaymentsCard() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-primary" />
        Payments
      </h2>
      <div className="text-center py-10 px-6 rounded-2xl bg-paper border border-border">
        <Receipt className="w-10 h-10 text-ink-faint mx-auto mb-3" />
        <h3 className="text-ink font-medium mb-1">No payments yet</h3>
        <p className="text-sm text-ink-muted">
          Registration receipts and upcoming charges will show up here.
        </p>
      </div>
    </div>
  )
}

export default function PaymentsSummary() {
  const [rows, setRows] = useState<PaymentSummaryRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch("/api/payments/history")
        if (!response.ok) throw new Error("Failed to fetch")
        const data = await response.json()
        const historyRows = (data.payments || []) as HistoryPaymentRow[]
        if (cancelled) return
        setRows(mapHistoryToSummary(historyRows))
      } catch {
        // Quiet degrade — see header comment. Treat a fetch error the same
        // as "no payments" rather than a scary banner on a summary card.
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Payments
        </h2>
        <LoadingSkeleton variant="card" rows={3} />
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return <EmptyPaymentsCard />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream-3 border border-border flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-ink">Payments</h2>
        </div>
        <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink gap-1" asChild>
          <a href="/dashboard/payments">
            View All
            <ChevronRight className="w-4 h-4" />
          </a>
        </Button>
      </div>

      <div className="space-y-1">
        {rows.map((payment) => {
          const config = statusConfig[payment.status] ?? statusConfig.pending
          const Icon = config.icon
          return (
            <div
              key={payment.id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-paper transition-all"
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                <Icon className={cn("w-4 h-4", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-2 truncate">{payment.description}</div>
                <div className="text-xs text-ink-faint">
                  {payment.personLabel} • {formatDate(payment.createdAt)}
                </div>
              </div>
              <span className="text-sm font-medium text-ink">
                {formatCurrency(payment.amountCents)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
