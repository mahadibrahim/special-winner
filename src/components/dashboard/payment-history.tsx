"use client"

import { useState, useEffect } from "react"
import { CreditCard, CheckCircle2, XCircle, Clock, Loader2, Receipt, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Payment {
  id: string
  amount: number
  amountCents: number
  paymentType: string
  status: string
  createdAt: string
  stripePaymentIntentId: string | null
  // Null for team-level payments (captain deposit / backstop balance),
  // which carry `team` instead.
  familyMember: {
    firstName: string
    lastName: string
  } | null
  team: {
    name: string
  } | null
  // Null for class-membership subscription charges (F1) — those rows have
  // no registration, so no season/program/sport chain. Render
  // `membership.tierName` instead when this is null.
  season: {
    name: string
  } | null
  program: {
    name: string
  } | null
  sport: {
    name: string
    icon: string | null
    color: string | null
  } | null
  membership: {
    tierName: string
  } | null
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  succeeded: {
    label: "Paid",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  refunded: {
    label: "Refunded",
    icon: XCircle,
    className: "bg-gray-500/10 text-ink-muted border-gray-500/20",
  },
}

const paymentTypeLabels: Record<string, string> = {
  full: "Full Payment",
  deposit: "Deposit",
  balance: "Balance",
  refund: "Refund",
  installment: "Installment",
  membership: "Membership",
}

const fallbackIcons: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  football: "🏈",
  "t-ball": "🥎",
}

export default function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/payments/history")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setPayments(data.payments || [])
    } catch {
      setError("Failed to load payment history")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  // Calculate totals
  const totalPaid = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" className="text-ink-muted hover:text-ink">
            <a href="/dashboard">
              <ArrowLeft className="w-5 h-5" />
            </a>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-ink">Payment History</h1>
            <p className="text-ink-muted text-sm">View all your past payments and receipts</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-paper border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-ink-muted text-sm">Total Paid</span>
          </div>
          <p className="text-2xl font-bold text-ink">${(totalPaid / 100).toFixed(2)}</p>
        </div>

        <div className="bg-paper border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <span className="text-ink-muted text-sm">Transactions</span>
          </div>
          <p className="text-2xl font-bold text-ink">{payments.length}</p>
        </div>

        <div className="bg-paper border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-ink-muted text-sm">Successful</span>
          </div>
          <p className="text-2xl font-bold text-ink">
            {payments.filter((p) => p.status === "succeeded").length}
          </p>
        </div>
      </div>

      {/* Payment List */}
      <div className="bg-paper border border-border rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="font-semibold text-ink">All Transactions</h2>
        </div>

        {error && (
          <div className="p-4 m-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-cream-2 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-ink-muted" />
            </div>
            <p className="text-ink-muted mb-2">No payments yet</p>
            <p className="text-sm text-ink-muted mb-4">Your payment history will appear here</p>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <a href="/programs">Browse Programs</a>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {payments.map((payment) => {
              const status = statusConfig[payment.status] || statusConfig.pending
              const StatusIcon = status.icon
              // Membership charges (F1) carry no sport/season — fall back to
              // a generic icon/color and the tier name instead.
              const sportIcon =
                payment.sport?.icon ||
                (payment.sport ? fallbackIcons[payment.sport.name.toLowerCase()] : undefined) ||
                "🏃"
              const sportColor = payment.sport?.color || "#6b7280"
              const title =
                payment.season?.name ??
                (payment.membership ? `${payment.membership.tierName} Membership` : "Payment")

              return (
                <div key={payment.id} className="p-6 hover:bg-paper transition-colors">
                  <div className="flex items-center gap-4">
                    {/* Sport Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{
                        backgroundColor: `${sportColor}15`,
                        border: `1px solid ${sportColor}30`,
                      }}
                    >
                      {sportIcon}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-ink truncate">{title}</h3>
                        <Badge variant="outline" className="text-xs text-ink-muted border-border">
                          {paymentTypeLabels[payment.paymentType] || payment.paymentType}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-muted">
                        {payment.familyMember
                          ? `${payment.familyMember.firstName} ${payment.familyMember.lastName}`
                          : payment.team
                            ? `Team: ${payment.team.name}`
                            : "—"}
                      </p>
                      <p className="text-xs text-ink-faint mt-1">{formatDate(payment.createdAt)}</p>
                    </div>

                    {/* Amount and Status */}
                    <div className="text-right">
                      <p className="text-lg font-bold text-ink mb-1">
                        ${payment.amount.toFixed(2)}
                      </p>
                      <Badge variant="outline" className={`${status.className} flex items-center gap-1 w-fit ml-auto`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
