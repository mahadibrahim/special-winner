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

// Mock data
const mockPayments: Payment[] = [
  {
    id: "pay_1",
    description: "Fall Soccer League Registration",
    program: "U10 Lightning",
    childName: "Emma",
    amount: 195.00,
    status: "paid",
    paidDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    invoiceUrl: "#",
  },
  {
    id: "pay_2",
    description: "Basketball League - Monthly Payment",
    program: "U12 Hawks",
    childName: "Jake",
    amount: 75.00,
    status: "pending",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
  },
  {
    id: "pay_3",
    description: "Winter Skills Camp Deposit",
    program: "Soccer Skills Camp",
    childName: "Emma",
    amount: 50.00,
    status: "pending",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12),
  },
  {
    id: "pay_4",
    description: "Youth Basketball League Registration",
    program: "U12 Hawks",
    childName: "Jake",
    amount: 225.00,
    status: "paid",
    paidDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    invoiceUrl: "#",
  },
]

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
    color: "text-blue-400",
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

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Payments</h2>
            <p className="text-sm text-gray-500">
              {pendingPayments.length} upcoming payment{pendingPayments.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white gap-1" asChild>
          <a href="/dashboard/payments">
            View All
            <ChevronRight className="w-4 h-4" />
          </a>
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="text-xs text-gray-500 mb-1">Pending</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalPending)}</div>
          {pendingPayments.length > 0 && (
            <div className="text-xs text-amber-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next due in {getDaysUntilDue(pendingPayments[0].dueDate!)} days
            </div>
          )}
        </div>
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="text-xs text-gray-500 mb-1">Paid This Season</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalPaid)}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All caught up
          </div>
        </div>
      </div>

      {/* Pending Payments */}
      {pendingPayments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Upcoming</h3>
          <div className="space-y-2">
            {pendingPayments.map((payment) => {
              const config = statusConfig[payment.status]
              const Icon = config.icon
              const daysUntil = payment.dueDate ? getDaysUntilDue(payment.dueDate) : 0

              return (
                <div
                  key={payment.id}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-all cursor-pointer"
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                    <Icon className={cn("w-4 h-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {payment.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{payment.childName}</span>
                      <span className="text-gray-700">•</span>
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
                    <div className="font-semibold text-white">{formatCurrency(payment.amount)}</div>
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
          <h3 className="text-sm font-medium text-gray-400">Recent</h3>
          <div className="space-y-1">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/[0.02] transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300 truncate">
                    {payment.description}
                  </div>
                  <div className="text-xs text-gray-600">
                    {payment.childName} • Paid {formatDate(payment.paidDate!)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">
                    {formatCurrency(payment.amount)}
                  </span>
                  {payment.invoiceUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
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
          className="w-full justify-between text-gray-500 hover:text-white hover:bg-white/[0.02] border border-transparent hover:border-white/[0.06]"
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
