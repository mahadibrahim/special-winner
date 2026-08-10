"use client"

import { useState, useEffect } from "react"
import {
  CreditCard,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Payment {
  id: string
  amountCents: number
  paymentType: string
  status: string
  stripePaymentIntentId: string | null
  createdAt: string
  // Solo payments carry registration + familyMember; team-level payments
  // (captain deposit, backstop balance, their refunds) carry team instead.
  registration: {
    id: string
    status: string
  } | null
  team: {
    id: string
    name: string
  } | null
  familyMember: {
    id: string
    firstName: string
    lastName: string
  } | null
  season: {
    id: string
    name: string
  }
  program: {
    id: string
    name: string
  }
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}

interface Summary {
  totalPayments: number
  totalRevenue: number
  totalRefunds: number
  pendingPayments: number
  succeededPayments: number
  failedPayments: number
}

export function PaymentsList() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  useEffect(() => {
    fetchPayments()
  }, [statusFilter, typeFilter])

  async function fetchPayments() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (typeFilter !== "all") params.set("paymentType", typeFilter)

      const response = await fetch(`/api/admin/payments?${params}`)
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setPayments(data.payments)
      setSummary(data.summary)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function formatCurrency(cents: number) {
    return `$${(cents / 100).toFixed(2)}`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "succeeded":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Succeeded</Badge>
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
      case "failed":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  function getTypeBadge(payment: Payment) {
    const isTeam = payment.team != null
    switch (payment.paymentType) {
      case "full":
        return <Badge variant="outline">Full Payment</Badge>
      case "deposit":
        return isTeam ? (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Team deposit</Badge>
        ) : (
          <Badge variant="outline">Deposit</Badge>
        )
      case "balance":
        return isTeam ? (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Team balance</Badge>
        ) : (
          <Badge variant="outline">Balance</Badge>
        )
      case "refund":
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Refund</Badge>
      case "installment":
        return <Badge variant="outline">Installment</Badge>
      default:
        return <Badge variant="outline">{payment.paymentType}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <p className="text-gray-600 mt-1">View and manage all payment transactions</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-green-600" />
                Total Revenue
              </CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {formatCurrency(summary.totalRevenue)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-orange-600" />
                Total Refunds
              </CardDescription>
              <CardTitle className="text-2xl text-orange-600">
                {formatCurrency(summary.totalRefunds)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Succeeded
              </CardDescription>
              <CardTitle className="text-2xl">{summary.succeededPayments}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                Pending
              </CardDescription>
              <CardTitle className="text-2xl">{summary.pendingPayments}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex gap-4 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="full">Full Payment</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="installment">Installment</SelectItem>
              </SelectContent>
            </Select>
            {/* Server streams the CSV with the same filter params the
                list uses — what you see filtered is what you export. */}
            <a
              href={`/api/admin/payments/export.csv?${new URLSearchParams({
                ...(statusFilter !== "all" ? { status: statusFilter } : {}),
                ...(typeFilter !== "all" ? { paymentType: typeFilter } : {}),
              }).toString()}`}
              className="ml-auto inline-flex items-center px-3 py-2 text-sm font-medium rounded border border-border text-ink-muted hover:text-ink hover:bg-cream-2 transition-colors"
              download
            >
              Export CSV
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No payments found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                        {payment.paymentType === "refund" ? (
                          <ArrowDownRight className="w-5 h-5 text-orange-600" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {payment.familyMember
                            ? `${payment.familyMember.firstName} ${payment.familyMember.lastName}`
                            : payment.team
                              ? `Team: ${payment.team.name}`
                              : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {payment.program.name} - {payment.season.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payment.team ? `Paid by ${payment.user.email}` : payment.user.email} -{" "}
                          {formatDate(payment.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold text-lg ${payment.paymentType === "refund" ? "text-orange-600" : "text-green-600"}`}>
                          {payment.paymentType === "refund" ? "-" : "+"}{formatCurrency(payment.amountCents)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {getStatusBadge(payment.status)}
                        {getTypeBadge(payment)}
                      </div>
                      {payment.stripePaymentIntentId && (
                        <a
                          href={`https://dashboard.stripe.com/payments/${payment.stripePaymentIntentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          title="View in Stripe"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
