"use client"

import { useState, useEffect } from "react"
import {
  Users,
  Search,
  Filter,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  ListOrdered,
  DollarSign,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Registration {
  id: string
  status: string
  paymentStatus: string
  amountPaidCents: number
  amountDueCents: number
  registrationType: string | null
  waiverSigned: boolean
  ageReviewNeeded: boolean
  waitlistPosition: number | null
  createdAt: string
  cancelledAt: string | null
  familyMember: {
    id: string
    firstName: string
    lastName: string
  }
  season: {
    id: string
    name: string
  }
  program: {
    id: string
    name: string
  }
  sport: {
    id: string
    name: string
  }
  registeredBy: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
  /**
   * Present when this registration belongs to a team registration. The
   * member's own amounts are usually $0/$0 (the captain's deposit covers
   * them), so the team's money state is what the admin needs to see.
   */
  team: {
    id: string
    teamName: string
    teamFeeCents: number | null
    depositCents: number
    collectedCents: number
  } | null
}

interface Summary {
  total: number
  confirmed: number
  pending: number
  waitlisted: number
  cancelled: number
  paid: number
  unpaid: number
  partial: number
}

export function RegistrationsList() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchRegistrations()
  }, [statusFilter, paymentFilter])

  async function fetchRegistrations() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (paymentFilter !== "all") params.set("paymentStatus", paymentFilter)

      const response = await fetch(`/api/admin/registrations?${params}`)
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setRegistrations(data.registrations)
      setSummary(data.summary)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function formatCurrency(cents: number) {
    return `$${(cents / 100).toFixed(2)}`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Confirmed</Badge>
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
      case "waitlisted":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Waitlisted</Badge>
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  function getPaymentBadge(status: string) {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
      case "unpaid":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Unpaid</Badge>
      case "deposit_paid":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Deposit Paid</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  function needsAttention(r: Registration) {
    return !r.waiverSigned || r.ageReviewNeeded
  }

  const filteredRegistrations = registrations.filter((r) => {
    if (needsAttentionOnly && !needsAttention(r)) return false
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      r.familyMember.firstName.toLowerCase().includes(searchLower) ||
      r.familyMember.lastName.toLowerCase().includes(searchLower) ||
      r.registeredBy.email.toLowerCase().includes(searchLower) ||
      r.program.name.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Registrations</h1>
        <p className="text-gray-600 mt-1">Manage all program registrations</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Confirmed
              </CardDescription>
              <CardTitle className="text-2xl">{summary.confirmed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                Pending
              </CardDescription>
              <CardTitle className="text-2xl">{summary.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-blue-600" />
                Waitlisted
              </CardDescription>
              <CardTitle className="text-2xl">{summary.waitlisted}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-600" />
                Paid
              </CardDescription>
              <CardTitle className="text-2xl">{summary.paid}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or program..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="waitlisted">Waitlisted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="deposit_paid">Deposit Paid</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setNeedsAttentionOnly((prev) => !prev)}
              aria-pressed={needsAttentionOnly}
              className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded border transition-colors whitespace-nowrap ${
                needsAttentionOnly
                  ? "border-amber-300 bg-amber-100 text-amber-800"
                  : "border-border text-ink-muted hover:text-ink hover:bg-cream-2"
              }`}
            >
              Needs attention
            </button>
            {/* Server streams the CSV with the same filter params the
                list uses (search is client-side only and not applied). */}
            <a
              href={`/api/admin/registrations/export.csv?${new URLSearchParams({
                ...(statusFilter !== "all" ? { status: statusFilter } : {}),
                ...(paymentFilter !== "all" ? { paymentStatus: paymentFilter } : {}),
              }).toString()}`}
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded border border-border text-ink-muted hover:text-ink hover:bg-cream-2 transition-colors whitespace-nowrap"
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
          ) : filteredRegistrations.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No registrations found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRegistrations.map((registration) => {
                const isExpanded = expandedRows.has(registration.id)
                return (
                  <div key={registration.id} className="border rounded-lg overflow-hidden">
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleRow(registration.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {registration.familyMember.firstName} {registration.familyMember.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {registration.program.name} - {registration.season.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {!registration.waiverSigned && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            Waiver pending
                          </Badge>
                        )}
                        {registration.ageReviewNeeded && (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                            Age review
                          </Badge>
                        )}
                        {getStatusBadge(registration.status)}
                        {getPaymentBadge(registration.paymentStatus)}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-4 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Parent</p>
                            <p className="font-medium">
                              {registration.registeredBy.firstName} {registration.registeredBy.lastName}
                            </p>
                            <p className="text-muted-foreground">{registration.registeredBy.email}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            {registration.team ? (
                              <>
                                <p className="font-medium">
                                  Team: {formatCurrency(registration.team.collectedCents)} paid
                                  {registration.team.teamFeeCents != null &&
                                    ` / ${formatCurrency(registration.team.teamFeeCents)} total`}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  <a
                                    href={`/admin/teams/registrations/${registration.team.id}`}
                                    className="hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {registration.team.teamName}
                                  </a>{" "}
                                  — remainder splits across roster
                                </p>
                              </>
                            ) : (
                              <p className="font-medium">
                                {formatCurrency(registration.amountPaidCents)} / {formatCurrency(registration.amountDueCents)}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground">Registered</p>
                            <p className="font-medium">{formatDate(registration.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Waiver</p>
                            <p className="font-medium">{registration.waiverSigned ? "Signed" : "Not Signed"}</p>
                          </div>
                        </div>
                        {registration.waitlistPosition && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Waitlist Position:</span>{" "}
                            <span className="font-medium">#{registration.waitlistPosition}</span>
                          </p>
                        )}
                        <div className="pt-2 border-t border-gray-200">
                          <a
                            href={`/admin/registrations/${registration.id}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Manage registration
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
