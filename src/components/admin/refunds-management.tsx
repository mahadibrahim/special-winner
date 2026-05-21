"use client"

import { useState, useEffect } from "react"
import {
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Filter,
  User,
  Calendar,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface RefundRequest {
  id: string
  status: string
  refundStatus: string
  refundAmountCents: number | null
  amountPaidCents: number
  cancelledAt: string | null
  cancelledReason: string | null
  familyMember: {
    id: string
    firstName: string
    lastName: string
  }
  season: {
    id: string
    name: string
    startDate: string
  }
  program: {
    id: string
    name: string
  }
  parent: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}

interface Summary {
  pending: number
  approved: number
  processed: number
  denied: number
  totalPendingAmountCents: number
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending_approval: {
    label: "Pending",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Clock,
  },
  approved: {
    label: "Approved — processing",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Clock,
  },
  processed: {
    label: "Processed",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  denied: {
    label: "Denied",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
}

export function RefundsManagement() {
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("pending_approval")

  // Action dialog state
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null)
  const [actionType, setActionType] = useState<"approve" | "deny">("approve")
  const [denialReason, setDenialReason] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchRefunds()
  }, [statusFilter])

  async function fetchRefunds() {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/admin/refunds?status=${statusFilter}`)
      if (!response.ok) throw new Error("Failed to fetch refunds")
      const data = await response.json()
      setRefundRequests(data.refundRequests)
      setSummary(data.summary)
    } catch (err) {
      setError("Failed to load refund requests")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openActionDialog(refund: RefundRequest, action: "approve" | "deny") {
    setSelectedRefund(refund)
    setActionType(action)
    setDenialReason("")
    setIsActionDialogOpen(true)
  }

  async function handleAction() {
    if (!selectedRefund) return

    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/refunds/${selectedRefund.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          reason: actionType === "deny" ? denialReason : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process refund")
      }

      // Refresh list
      await fetchRefunds()
      setIsActionDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process refund")
    } finally {
      setIsProcessing(false)
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

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={statusFilter === "pending_approval" ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                Pending Approval
              </CardDescription>
              <CardTitle className="text-3xl">{summary.pending}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Total: {formatCurrency(summary.totalPendingAmountCents)}
              </p>
            </CardContent>
          </Card>

          <Card className={statusFilter === "processed" ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Processed
              </CardDescription>
              <CardTitle className="text-3xl">{summary.processed}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Refunds completed</p>
            </CardContent>
          </Card>

          <Card className={statusFilter === "approved" ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Approved — processing
              </CardDescription>
              <CardTitle className="text-3xl">{summary.approved}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Stripe refund in progress</p>
            </CardContent>
          </Card>

          <Card className={statusFilter === "denied" ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                Denied
              </CardDescription>
              <CardTitle className="text-3xl">{summary.denied}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Requests denied</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Refund Requests
              </CardTitle>
              <CardDescription>Review and process refund requests</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="all">All Requests</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : refundRequests.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No refund requests found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter === "pending_approval"
                  ? "All refund requests have been processed"
                  : "Try changing the filter"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {refundRequests.map((refund) => {
                const config = statusConfig[refund.refundStatus] || statusConfig.pending_approval
                const StatusIcon = config.icon
                const isExpanded = expandedRows.has(refund.id)

                return (
                  <div
                    key={refund.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Main row */}
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleRow(refund.id)}
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
                            {refund.familyMember.firstName} {refund.familyMember.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {refund.program.name} - {refund.season.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-lg">
                            {formatCurrency(refund.refundAmountCents || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            of {formatCurrency(refund.amountPaidCents)} paid
                          </p>
                        </div>
                        <Badge variant="outline" className={config.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t bg-gray-50 p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <Label className="text-muted-foreground">Parent</Label>
                            <p className="flex items-center gap-1 mt-1">
                              <User className="w-3 h-3" />
                              {refund.parent.firstName} {refund.parent.lastName}
                            </p>
                            <p className="text-muted-foreground">{refund.parent.email}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Cancelled</Label>
                            <p className="flex items-center gap-1 mt-1">
                              <Calendar className="w-3 h-3" />
                              {refund.cancelledAt
                                ? formatDate(refund.cancelledAt)
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Season Start</Label>
                            <p className="flex items-center gap-1 mt-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(refund.season.startDate)}
                            </p>
                          </div>
                        </div>

                        {refund.cancelledReason && (
                          <div>
                            <Label className="text-muted-foreground">
                              Cancellation Reason
                            </Label>
                            <p className="mt-1 text-sm bg-white p-2 rounded border">
                              {refund.cancelledReason}
                            </p>
                          </div>
                        )}

                        {refund.refundStatus === "pending_approval" && (
                          <div className="flex justify-end gap-2 pt-2">
                            <Button
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                openActionDialog(refund, "deny")
                              }}
                              className="border-red-200 text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Deny
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                openActionDialog(refund, "approve")
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Approve Refund
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Refund" : "Deny Refund"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve" ? (
                <>
                  Are you sure you want to approve this refund of{" "}
                  <strong>
                    {formatCurrency(selectedRefund?.refundAmountCents || 0)}
                  </strong>{" "}
                  for {selectedRefund?.familyMember.firstName}{" "}
                  {selectedRefund?.familyMember.lastName}?
                </>
              ) : (
                <>
                  Are you sure you want to deny the refund request for{" "}
                  {selectedRefund?.familyMember.firstName}{" "}
                  {selectedRefund?.familyMember.lastName}?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {actionType === "approve" ? (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm text-green-800">
                  <strong>This will:</strong>
                </p>
                <ul className="text-sm text-green-700 mt-2 space-y-1">
                  <li>• Process a Stripe refund to the original payment method</li>
                  <li>• Update the registration status to "Refunded"</li>
                  <li>• Send a confirmation email to the parent</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800">
                  The parent will be notified that their refund request was denied.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="denialReason">Reason for denial (optional)</Label>
                <Textarea
                  id="denialReason"
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  placeholder="Explain why the refund is being denied..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsActionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={isProcessing}
              className={
                actionType === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : actionType === "approve" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve & Process Refund
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-1" />
                  Deny Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
