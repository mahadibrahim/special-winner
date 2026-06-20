"use client"

import { useState, useEffect } from "react"
import { ClipboardList, Calendar, MapPin, Loader2, ArrowRight, Clock, CheckCircle2, AlertCircle, XCircle, X, Ban, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { parseDateOnly } from "@/lib/time/format-date"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Registration {
  id: string
  status: string
  paymentStatus: string
  amountPaidCents: number
  amountDueCents: number
  registrationType: string
  waiverSigned: boolean
  notes: string | null
  createdAt: string
  familyMember: {
    id: string
    firstName: string
    lastName: string
    birthDate: string
  }
  season: {
    id: string
    name: string
    startDate: string
    endDate: string
    scheduleNotes: string | null
  }
  program: {
    id: string
    name: string
    slug: string
  }
  sport: {
    id: string
    name: string
    icon: string | null
    color: string | null
  }
  location: {
    id: string
    name: string
    city: string | null
  }
  ageGroup: {
    id: string
    name: string
    minAge: number
    maxAge: number
  } | null
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  pending: {
    label: "Pending Payment",
    icon: Clock,
    className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-500 border-green-500/20",
  },
  waitlisted: {
    label: "Waitlisted",
    icon: AlertCircle,
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-gray-500/10 text-ink-muted border-gray-500/20",
  },
  refunded: {
    label: "Refunded",
    icon: XCircle,
    className: "bg-gray-500/10 text-ink-muted border-gray-500/20",
  },
}

const fallbackIcons: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  football: "🏈",
  "t-ball": "🥎",
}

export default function RegistrationsCard() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cancel dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingRegistration, setCancellingRegistration] = useState<Registration | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<{
    refundAmountCents: number
    refundStatus: string
    message: string
  } | null>(null)

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null)
  const [editRegistrationType, setEditRegistrationType] = useState<string>("")
  const [editNotes, setEditNotes] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [editResult, setEditResult] = useState<{
    additionalPaymentRequired: boolean
    additionalAmountCents: number
  } | null>(null)

  // Resume-payment state
  const [resumingRegistrationId, setResumingRegistrationId] = useState<string | null>(null)

  const handleResumePayment = (registrationId: string) => {
    // Send the parent into the registration wizard's resume-payment UI,
    // which renders the embedded Stripe form. Phase 2 will replace this with
    // a dedicated /dashboard/registrations/[id]/pay-balance page.
    const reg = registrations.find((r) => r.id === registrationId)
    if (!reg) return
    setResumingRegistrationId(registrationId)
    window.location.href = `/register/${reg.season.id}?payment=cancelled`
  }

  useEffect(() => {
    fetchRegistrations()
  }, [])

  const fetchRegistrations = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/registrations")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setRegistrations(data.registrations || [])
    } catch {
      setError("Failed to load registrations")
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatDateRange = (start: string, end: string) => {
    const startDate = parseDateOnly(start)
    const endDate = parseDateOnly(end)
    const startMonth = startDate.toLocaleDateString("en-US", { month: "short" })
    const endMonth = endDate.toLocaleDateString("en-US", { month: "short" })
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    const year = endDate.getFullYear()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
  }

  const openCancelDialog = (registration: Registration) => {
    setCancellingRegistration(registration)
    setCancelReason("")
    setCancelResult(null)
    setIsCancelDialogOpen(true)
  }

  const closeCancelDialog = () => {
    setIsCancelDialogOpen(false)
    setCancellingRegistration(null)
    setCancelReason("")
    setCancelResult(null)
  }

  const handleCancelRegistration = async () => {
    if (!cancellingRegistration) return

    setIsCancelling(true)
    setError(null)

    try {
      const response = await fetch(`/api/registrations/${cancellingRegistration.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel registration")
      }

      // Show result
      setCancelResult({
        refundAmountCents: data.refund?.amountCents || 0,
        refundStatus: data.refund?.status || "none",
        message: data.refund?.message || "Registration cancelled",
      })

      // Refresh registrations list
      await fetchRegistrations()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel registration")
    } finally {
      setIsCancelling(false)
    }
  }

  const canCancel = (status: string) => {
    return !["cancelled", "refunded"].includes(status)
  }

  const canEdit = (status: string) => {
    return !["cancelled", "refunded"].includes(status)
  }

  const openEditDialog = (registration: Registration) => {
    setEditingRegistration(registration)
    setEditRegistrationType(registration.registrationType)
    setEditNotes(registration.notes || "")
    setEditResult(null)
    setIsEditDialogOpen(true)
  }

  const closeEditDialog = () => {
    setIsEditDialogOpen(false)
    setEditingRegistration(null)
    setEditRegistrationType("")
    setEditNotes("")
    setEditResult(null)
  }

  const handleEditRegistration = async () => {
    if (!editingRegistration) return

    setIsEditing(true)
    setError(null)

    try {
      const payload: { registrationType?: string; notes?: string } = {}

      // Only include changed fields
      if (editRegistrationType !== editingRegistration.registrationType) {
        payload.registrationType = editRegistrationType
      }
      if (editNotes !== (editingRegistration.notes || "")) {
        payload.notes = editNotes
      }

      // Don't make request if nothing changed
      if (Object.keys(payload).length === 0) {
        closeEditDialog()
        return
      }

      const response = await fetch(`/api/registrations/${editingRegistration.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update registration")
      }

      // Check if additional payment is required
      if (data.additionalPaymentRequired) {
        setEditResult({
          additionalPaymentRequired: true,
          additionalAmountCents: data.additionalAmountCents,
        })
      } else {
        // Close dialog and refresh
        closeEditDialog()
      }

      // Refresh registrations list
      await fetchRegistrations()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update registration")
    } finally {
      setIsEditing(false)
    }
  }

  const pendingUnpaidCount = registrations.filter(
    (r) => r.status === "pending" && r.paymentStatus === "unpaid",
  ).length

  return (
    <div className="bg-paper border border-border rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">My Registrations</h3>
              <p className="text-sm text-ink-muted">
                {registrations.length} {registrations.length === 1 ? "registration" : "registrations"}
                {pendingUnpaidCount > 0 && (
                  <span className="text-yellow-600 font-medium">
                    {" · "}
                    {pendingUnpaidCount} awaiting payment
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90">
            <a href="/programs">
              Browse Programs
              <ArrowRight className="w-4 h-4 ml-1" />
            </a>
          </Button>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {!isLoading && pendingUnpaidCount > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />
            <span className="text-yellow-700">
              {pendingUnpaidCount === 1
                ? "You have a registration awaiting payment. Complete payment to secure the spot."
                : `You have ${pendingUnpaidCount} registrations awaiting payment. Complete payment to secure the spots.`}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-cream-2 flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="w-6 h-6 text-ink-muted" />
            </div>
            <p className="text-ink-muted mb-1">No registrations yet</p>
            <p className="text-sm text-ink-muted mb-4">Browse programs and register your children</p>
            <Button asChild variant="outline" className="border-border text-ink hover:bg-cream-2">
              <a href="/programs">Find Programs</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {registrations.map((reg) => {
              const status = statusConfig[reg.status] || statusConfig.pending
              const StatusIcon = status.icon
              const sportIcon = reg.sport.icon || fallbackIcons[reg.sport.name.toLowerCase()] || "🏃"

              return (
                <div
                  key={reg.id}
                  className="p-4 rounded-xl bg-paper border border-border hover:border-border transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Sport Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{
                        backgroundColor: `${reg.sport.color || "#6b7280"}15`,
                        border: `1px solid ${reg.sport.color || "#6b7280"}30`,
                      }}
                    >
                      {sportIcon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="font-semibold text-ink">{reg.season.name}</h4>
                          <p className="text-sm text-ink-muted">
                            {reg.familyMember.firstName} {reg.familyMember.lastName}
                          </p>
                        </div>
                        <Badge variant="outline" className={`${status.className} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDateRange(reg.season.startDate, reg.season.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {reg.location.name}
                          {reg.location.city && `, ${reg.location.city}`}
                        </span>
                      </div>

                      {/* Actions section */}
                      {(reg.status === "pending" && reg.paymentStatus === "unpaid") || reg.paymentStatus === "deposit_paid" || canCancel(reg.status) || canEdit(reg.status) ? (
                        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                          {reg.status === "pending" && reg.paymentStatus === "unpaid" ? (
                            <span className="text-sm text-ink-muted">
                              Amount due: <span className="text-ink font-medium">${(reg.amountDueCents / 100).toFixed(2)}</span>
                            </span>
                          ) : reg.paymentStatus === "deposit_paid" ? (
                            <span className="text-sm text-ink-muted">
                              Balance due: <span className="text-ink font-medium">${((reg.amountDueCents - reg.amountPaidCents) / 100).toFixed(2)}</span>
                            </span>
                          ) : (
                            <span />
                          )}
                          <div className="flex items-center gap-2">
                            {canEdit(reg.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(reg)}
                                className="border-border text-ink-2 hover:bg-cream-2"
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1" />
                                Edit
                              </Button>
                            )}
                            {canCancel(reg.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCancelDialog(reg)}
                                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                              >
                                <Ban className="w-3.5 h-3.5 mr-1" />
                                Cancel
                              </Button>
                            )}
                            {reg.status === "pending" && reg.paymentStatus === "unpaid" && (
                              <Button
                                size="sm"
                                className="bg-primary hover:bg-primary/90"
                                onClick={() => handleResumePayment(reg.id)}
                                disabled={resumingRegistrationId === reg.id}
                              >
                                {resumingRegistrationId === reg.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    Starting…
                                  </>
                                ) : (
                                  "Complete Payment"
                                )}
                              </Button>
                            )}
                            {reg.paymentStatus === "deposit_paid" && (
                              <Button
                                asChild
                                size="sm"
                                className="bg-primary hover:bg-primary/90"
                              >
                                <a href={`/dashboard/registrations/${reg.id}/pay-balance`}>
                                  Pay Balance
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="bg-cream border-border text-ink sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              Cancel Registration
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              {cancelResult ? (
                "Your registration has been cancelled."
              ) : (
                <>
                  Are you sure you want to cancel{" "}
                  <span className="text-ink font-medium">
                    {cancellingRegistration?.familyMember.firstName}'s
                  </span>{" "}
                  registration for{" "}
                  <span className="text-ink font-medium">
                    {cancellingRegistration?.season.name}
                  </span>
                  ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {cancelResult ? (
            <div className="py-4">
              <div className="p-4 rounded-xl bg-paper border border-border space-y-3">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Registration Cancelled</span>
                </div>
                {cancelResult.refundAmountCents > 0 ? (
                  <div className="text-sm text-ink-muted">
                    <p className="mb-1">Refund Amount: <span className="text-ink font-medium">${(cancelResult.refundAmountCents / 100).toFixed(2)}</span></p>
                    <p>{cancelResult.message}</p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">{cancelResult.message}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {/* Refund Policy Info */}
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
                <p className="text-yellow-400 font-medium mb-1">Refund Policy</p>
                <ul className="text-yellow-400/80 space-y-0.5 text-xs">
                  <li>• More than 7 days before start: Full refund</li>
                  <li>• Less than 7 days before start: 50% refund</li>
                  <li>• After season starts: No refund</li>
                </ul>
              </div>

              {/* Reason input */}
              <div className="space-y-2">
                <Label htmlFor="cancelReason" className="text-ink-2">
                  Reason for cancellation (optional)
                </Label>
                <Input
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Let us know why you're cancelling"
                  className="bg-cream-2 border-border text-ink placeholder:text-ink-muted"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {cancelResult ? (
              <Button
                onClick={closeCancelDialog}
                className="bg-primary hover:bg-primary/90"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCancelDialog}
                  className="border-border text-ink-2 hover:bg-cream-2"
                >
                  Keep Registration
                </Button>
                <Button
                  onClick={handleCancelRegistration}
                  disabled={isCancelling}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 mr-2" />
                      Yes, Cancel Registration
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Registration Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-cream border-border text-ink sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Edit Registration
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              Update registration details for{" "}
              <span className="text-ink font-medium">
                {editingRegistration?.familyMember.firstName}
              </span>{" "}
              in{" "}
              <span className="text-ink font-medium">
                {editingRegistration?.season.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          {editResult?.additionalPaymentRequired ? (
            <div className="py-4">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Registration Updated</span>
                </div>
                <div className="text-sm text-ink-muted">
                  <p className="mb-2">
                    You've upgraded to full payment. Additional amount due:{" "}
                    <span className="text-ink font-medium">
                      ${(editResult.additionalAmountCents / 100).toFixed(2)}
                    </span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    Complete your payment to finalize the upgrade.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {/* Registration Type */}
              <div className="space-y-2">
                <Label htmlFor="registrationType" className="text-ink-2">
                  Payment Type
                </Label>
                <Select value={editRegistrationType} onValueChange={setEditRegistrationType}>
                  <SelectTrigger className="bg-cream-2 border-border text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-cream border-border">
                    <SelectItem value="deposit" className="text-ink-2">
                      Deposit Only
                    </SelectItem>
                    <SelectItem value="full" className="text-ink-2">
                      Full Payment
                    </SelectItem>
                  </SelectContent>
                </Select>
                {editingRegistration?.registrationType === "deposit" && editRegistrationType === "full" && (
                  <p className="text-xs text-yellow-400">
                    Upgrading to full payment will require an additional payment.
                  </p>
                )}
                {editingRegistration?.registrationType === "full" && editRegistrationType === "deposit" && (
                  <p className="text-xs text-destructive">
                    Cannot downgrade from full payment to deposit.
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="editNotes" className="text-ink-2">
                  Notes (optional)
                </Label>
                <Textarea
                  id="editNotes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Any special requests or information"
                  rows={3}
                  className="bg-cream-2 border-border text-ink placeholder:text-ink-muted resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {editResult?.additionalPaymentRequired ? (
              <>
                <Button
                  variant="outline"
                  onClick={closeEditDialog}
                  className="border-border text-ink-2 hover:bg-cream-2"
                >
                  Pay Later
                </Button>
                <Button
                  className="bg-primary hover:bg-primary/90"
                  onClick={() => {
                    if (editingRegistration) {
                      const id = editingRegistration.id
                      closeEditDialog()
                      handleResumePayment(id)
                    }
                  }}
                  disabled={!editingRegistration || resumingRegistrationId === editingRegistration?.id}
                >
                  {editingRegistration && resumingRegistrationId === editingRegistration.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    "Complete Payment"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditDialog}
                  className="border-border text-ink-2 hover:bg-cream-2"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditRegistration}
                  disabled={isEditing || (editingRegistration?.registrationType === "full" && editRegistrationType === "deposit")}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
