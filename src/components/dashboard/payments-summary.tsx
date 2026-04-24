"use client"

import {
  CreditCard,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Receipt,
  TrendingUp,
  Download,
  Calendar
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PaymentStatus = "paid" | "pending" | "overdue" | "processing"

interface Payment {
  id: string
  description: string
  program: string
  childName: string
  amount: number
  status: PaymentStatus
  dueDate?: Date
  paidDate?: Date
  invoiceUrl?: string
}

// Real data wiring pending. Empty array shows an honest empty state.
const mockPayments: Payment[] = []

const statusConfig: Record<PaymentStatus, {
  icon: typeof CheckCircle2
  color: string
  bg: string
  label: string
}> = {
  paid: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Paid"
  },
  pending: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    label: "Due Soon"
  },
  overdue: {
    icon: AlertCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Overdue"
  },
  processing: {
    icon: TrendingUp,
    color: "text-primary",
    bg: "bg-blue-500/10",
    label: "Processing"
  },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getDaysUntilDue(date: Date): number {
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export default function PaymentsSummary() {
  const pendingPayments = mockPayments.filter(p => p.status === "pending" || p.status === "overdue")
  const recentPayments = mockPayments.filter(p => p.status === "paid").slice(0, 3)

  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = recentPayments.reduce((sum, p) => sum + p.amount, 0)

  if (mockPayments.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-emerald-400" />
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

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink">Payments</h2>
            <p className="text-sm text-ink-muted">
              {pendingPayments.length} upcoming payment{pendingPayments.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink gap-1" asChild>
          <a href="/dashboard/payments">
            View All
            <ChevronRight className="w-4 h-4" />
          </a>
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="text-xs text-ink-muted mb-1">Pending</div>
          <div className="text-2xl font-bold text-ink">{formatCurrency(totalPending)}</div>
          {pendingPayments.length > 0 && (
            <div className="text-xs text-amber-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next due in {getDaysUntilDue(pendingPayments[0].dueDate!)} days
            </div>
          )}
        </div>
        <div className="p-4 rounded-xl bg-paper border border-border">
          <div className="text-xs text-ink-muted mb-1">Paid This Season</div>
          <div className="text-2xl font-bold text-ink">{formatCurrency(totalPaid)}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All caught up
          </div>
        </div>
      </div>

      {/* Pending Payments */}
      {pendingPayments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-ink-muted">Upcoming</h3>
          <div className="space-y-2">
            {pendingPayments.map((payment) => {
              const config = statusConfig[payment.status]
              const Icon = config.icon
              const daysUntil = payment.dueDate ? getDaysUntilDue(payment.dueDate) : 0

              return (
                <div
                  key={payment.id}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-paper border border-border hover:border-border transition-all cursor-pointer"
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                    <Icon className={cn("w-4 h-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink truncate">
                        {payment.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{payment.childName}</span>
                      <span className="text-ink-faint">•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Due {formatDate(payment.dueDate!)}
                        {daysUntil <= 7 && (
                          <span className="text-amber-400 ml-1">({daysUntil}d)</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-ink">{formatCurrency(payment.amount)}</div>
                    <Button size="sm" className="mt-1 h-7 text-xs">
                      Pay Now
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      {recentPayments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-ink-muted">Recent</h3>
          <div className="space-y-1">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="group flex items-center gap-3 p-3 rounded-lg hover:bg-paper transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-2 truncate">
                    {payment.description}
                  </div>
                  <div className="text-xs text-ink-faint">
                    {payment.childName} • Paid {formatDate(payment.paidDate!)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-muted">
                    {formatCurrency(payment.amount)}
                  </span>
                  {payment.invoiceUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-ink-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Methods Link */}
      <div className="pt-2">
        <Button
          variant="ghost"
          className="w-full justify-between text-ink-muted hover:text-ink hover:bg-paper border border-transparent hover:border-border"
        >
          <span className="flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Manage Payment Methods
          </span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
