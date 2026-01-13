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
  familyMember: {
    firstName: string
    lastName: string
  }
  season: {
    name: string
  }
  program: {
    name: string
  }
  sport: {
    name: string
    icon: string | null
    color: string | null
  }
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
    className: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  },
}

const paymentTypeLabels: Record<string, string> = {
  full: "Full Payment",
  deposit: "Deposit",
  balance: "Balance",
  refund: "Refund",
  installment: "Installment",
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
          <Button asChild variant="ghost" size="icon" className="text-gray-400 hover:text-white">
            <a href="/dashboard">
              <ArrowLeft className="w-5 h-5" />
            </a>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Payment History</h1>
            <p className="text-gray-400 text-sm">View all your past payments and receipts</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-500" />
            </div>
            <span className="text-gray-400 text-sm">Total Paid</span>
          </div>
          <p className="text-2xl font-bold text-white">${(totalPaid / 100).toFixed(2)}</p>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <span className="text-gray-400 text-sm">Transactions</span>
          </div>
          <p className="text-2xl font-bold text-white">{payments.length}</p>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-gray-400 text-sm">Successful</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {payments.filter((p) => p.status === "succeeded").length}
          </p>
        </div>
      </div>

      {/* Payment List */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/[0.06]">
          <h2 className="font-semibold text-white">All Transactions</h2>
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
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">No payments yet</p>
            <p className="text-sm text-gray-500 mb-4">Your payment history will appear here</p>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <a href="/#programs">Browse Programs</a>
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {payments.map((payment) => {
              const status = statusConfig[payment.status] || statusConfig.pending
              const StatusIcon = status.icon
              const sportIcon =
                payment.sport.icon ||
                fallbackIcons[payment.sport.name.toLowerCase()] ||
                "🏃"

              return (
                <div key={payment.id} className="p-6 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    {/* Sport Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{
                        backgroundColor: `${payment.sport.color || "#6b7280"}15`,
                        border: `1px solid ${payment.sport.color || "#6b7280"}30`,
                      }}
                    >
                      {sportIcon}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-white truncate">{payment.season.name}</h3>
                        <Badge variant="outline" className="text-xs text-gray-400 border-white/10">
                          {paymentTypeLabels[payment.paymentType] || payment.paymentType}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">
                        {payment.familyMember.firstName} {payment.familyMember.lastName}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">{formatDate(payment.createdAt)}</p>
                    </div>

                    {/* Amount and Status */}
                    <div className="text-right">
                      <p className="text-lg font-bold text-white mb-1">
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
