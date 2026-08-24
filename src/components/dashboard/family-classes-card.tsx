"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard"
import type { StatusTone } from "@/lib/dashboard/dashboard-ui"
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text"
import { waiverAssentSentence } from "@/lib/consents/waiver-consent-language"

/**
 * Family dashboard — per-child class membership card (Task 7 of the youth
 * classes UX plan). Mounts `client:load` in family.astro's "What you're
 * part of" section, above `<ChildrenOverview client:load/>`.
 *
 * Fetches `/api/classes/summary` once and renders one `DashboardCard` per
 * child who EITHER holds a class membership OR has used their org trial
 * (`trialUsed`). Children with neither render nothing — `ChildrenOverview`
 * already covers the plain "no classes yet" case, so duplicating that here
 * would be noise. The whole component renders `null` when zero children
 * qualify (no empty section, no dangling heading).
 *
 * Field note: the summary endpoint (src/pages/api/classes/summary.ts) does
 * NOT expose a membership renewal/period-end date or the org's cancellation
 * cutoff window — both were checked against the actual route rather than
 * assumed. Renewal date is simply not rendered (nothing to show); the
 * cancel confirm below uses generic "before the cancellation window" copy
 * per the task brief rather than inventing a number.
 *
 * Two actions live in a modal (`MakeUpModal`) or delegate to an existing
 * page (`Change home slot` → the Task-3/4 choose-slot page, which already
 * has switch semantics — never a second slot-picker UI here). `Cancel`
 * posts directly. Every async flow uses explicit params (never a stale
 * `child` read off state) and a monotonic generation counter inside the
 * modal, mirroring trial-booking.tsx's documented stale-closure fix.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryMembership {
  tierName: string
  status: "active" | "paused" | "past_due" | "incomplete"
  classAllotmentRemaining: number | "unlimited"
}

interface SummaryEnrollment {
  id: string
  templateId: string
  templateName: string
  weekday: number
  startTime: string
}

interface SummaryNextSession {
  sessionId: string
  startsAt: string
  bookingId: string
}

interface SummaryChild {
  familyMemberId: string
  name: string
  membership: SummaryMembership | null
  enrollment: SummaryEnrollment | null
  nextSession: SummaryNextSession | null
  trialUsed: boolean
}

interface ScheduleSlot {
  templateId: string
  name: string
  sportLabel: string | null
  weekday: number
  startTime: string
  durationMins: number
  minAge: number | null
  maxAge: number | null
  locationName: string | null
  venueName: string | null
  capacity: number
  enrolledCount: number
  spotsLeft: number
}

interface ScheduleSession {
  id: string
  templateId: string
  startsAt: string
  endsAt: string
  capacity: number
  bookedCount: number
  spotsLeft: number
}

interface FamilyMemberRow {
  id: string
  birthDate: string | null
}

interface TierBenefits {
  classes_per_month?: number
  unlimited_classes?: boolean
  [key: string]: unknown
}

interface MembershipTier {
  id: string
  monthlyPriceCents: number | null
  benefits: TierBenefits
}

// ---------------------------------------------------------------------------
// Helpers — small pure functions duplicated per repo convention (see
// choose-slot.tsx / trial-booking.tsx / class-tiers.tsx header comments):
// each client island keeps its own copies rather than importing across
// files that may pull in server-only dependencies.
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatDayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} ${startTime.slice(0, 5)}`
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${day} ${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Mirrors ageOnDate in src/lib/classes/book-child.ts exactly. */
function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number)
  let age = onDate.getUTCFullYear() - by
  const monthDiff = onDate.getUTCMonth() + 1 - bm
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1
  }
  return age
}

/** Mirrors isAgeIneligible in src/lib/classes/enrollment.ts (inverted). */
function isAgeEligible(slot: ScheduleSlot, age: number | null): boolean {
  if (age === null) return true
  if (slot.minAge !== null && age < slot.minAge) return false
  if (slot.maxAge !== null && age > slot.maxAge) return false
  return true
}

/** Mirrors isClassTier in class-tiers.tsx. */
function isClassTier(tier: MembershipTier): boolean {
  const benefits = tier.benefits ?? {}
  const classesPerMonth =
    typeof benefits.classes_per_month === "number" ? benefits.classes_per_month : 0
  return classesPerMonth > 0 || benefits.unlimited_classes === true
}

/** Mirrors fmtDollars in class-tiers.tsx. */
function fmtDollars(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null
  const dollars = cents / 100
  const hasCents = cents % 100 !== 0
  return `$${dollars.toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`
}

function allotmentLabel(remaining: number | "unlimited"): string {
  if (remaining === "unlimited") return "Unlimited classes this month"
  return `${remaining} class${remaining === 1 ? "" : "es"} left this month`
}

function statusBadge(status: SummaryMembership["status"]): { label: string; tone: StatusTone } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "confirmed" }
    case "past_due":
      return { label: "Past due", tone: "action" }
    case "paused":
      return { label: "Paused", tone: "pending" }
    case "incomplete":
      return { label: "Setting up", tone: "pending" }
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Make-up booking modal
// ---------------------------------------------------------------------------

type ModalPhase =
  | "loading"
  | "load_error"
  | "picking"
  | "booking"
  | "waiver"
  | "allotment_exhausted"
  | "paying"
  | "success"

interface ExhaustedOffer {
  session: ScheduleSession
  memberRateCents: number
}

interface MakeUpModalProps {
  child: SummaryChild
  open: boolean
  onClose: () => void
  /** Called once a make-up booking actually lands, so the parent card can
   *  refresh /api/classes/summary (new nextSession, allotment used). */
  onBooked: () => void
}

function MakeUpModal({ child, open, onClose, onBooked }: MakeUpModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)

  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [sessions, setSessions] = useState<ScheduleSession[]>([])
  const [childAge, setChildAge] = useState<number | null>(null)

  const [pendingSession, setPendingSession] = useState<ScheduleSession | null>(null)
  const [exhaustedOffer, setExhaustedOffer] = useState<ExhaustedOffer | null>(null)
  const [bookedSession, setBookedSession] = useState<ScheduleSession | null>(null)

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignerName, setWaiverSignerName] = useState("")

  // Monotonic generation counter — see trial-booking.tsx's "Re-entrancy"
  // doc comment for the exact bug class this guards against (a booking
  // request still in flight when the parent closes the modal must not
  // resurrect it via a delayed setPhase).
  const generationRef = useRef(0)

  // Defensive body-scroll lock — same rationale as trial-booking.tsx.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const load = useCallback(async () => {
    const myGeneration = ++generationRef.current
    setPhase("loading")
    setLoadError(null)
    setFlowError(null)
    setPendingSession(null)
    setExhaustedOffer(null)
    setBookedSession(null)
    setWaiverAccepted(false)
    setWaiverSignerName("")
    try {
      const [scheduleRes, familyRes] = await Promise.all([
        fetch("/api/public/class-schedule"),
        fetch("/api/family-members"),
      ])
      if (myGeneration !== generationRef.current) return
      if (!scheduleRes.ok || !familyRes.ok) throw new Error("bad status")
      const scheduleBody = (await scheduleRes.json()) as {
        slots: ScheduleSlot[]
        sessions: ScheduleSession[]
      }
      const familyBody = (await familyRes.json()) as { familyMembers: FamilyMemberRow[] }
      if (myGeneration !== generationRef.current) return
      const familyRow = familyBody.familyMembers.find((f) => f.id === child.familyMemberId)
      const age =
        familyRow?.birthDate != null ? ageOnDate(familyRow.birthDate, new Date()) : null
      setSlots(scheduleBody.slots)
      setSessions(scheduleBody.sessions)
      setChildAge(age)
      setPhase("picking")
    } catch {
      if (myGeneration !== generationRef.current) return
      setLoadError("Couldn't load available classes — please try again.")
      setPhase("load_error")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.familyMemberId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  function humanizeBookError(code: string | undefined, message: unknown): string {
    switch (code) {
      case "session_full":
        return "That class just filled up — pick another time below."
      case "session_started":
      case "session_not_scheduled":
        return "That class isn't open for booking — pick another time below."
      case "age_ineligible":
        return `${child.name} is outside this class's age range.`
      case "already_booked":
        return "Already booked for that class."
      case "trial_already_used":
      case "member_child_no_trial":
        return "That booking type isn't available for this child."
      default:
        return typeof message === "string" ? message : "Could not book this class — please try again."
    }
  }

  async function attemptBook(
    session: ScheduleSession,
    waiver?: { signedBy: string; consentText: string },
  ) {
    const myGeneration = generationRef.current
    setPhase("booking")
    setFlowError(null)

    let res: Response
    try {
      res = await fetch("/api/classes/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          familyMemberId: child.familyMemberId,
          kind: "member",
          ...(waiver ? { waiver } : {}),
        }),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setPhase("picking")
      return
    }
    if (myGeneration !== generationRef.current) return

    if (res.ok) {
      setBookedSession(session)
      setPhase("success")
      onBooked()
      return
    }

    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return
    const code = typeof body.error === "string" ? body.error : undefined

    if (res.status === 402 && code === "allotment_exhausted") {
      const memberRateCents = typeof body.memberRateCents === "number" ? body.memberRateCents : 0
      setExhaustedOffer({ session, memberRateCents })
      setPhase("allotment_exhausted")
      return
    }

    if (code === "waiver_required") {
      setPendingSession(session)
      setPhase("waiver")
      return
    }

    if (code === "already_booked") {
      setBookedSession(session)
      setPhase("success")
      onBooked()
      return
    }

    setFlowError(humanizeBookError(code, body.message))
    setPhase("picking")
  }

  async function submitWaiver(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingSession) return
    if (!waiverAccepted || waiverSignerName.trim().length === 0) return
    await attemptBook(pendingSession, {
      signedBy: waiverSignerName.trim(),
      consentText: DROPIN_WAIVER_TEXT,
    })
  }

  async function payForClass() {
    if (!exhaustedOffer) return
    const myGeneration = generationRef.current
    setPhase("paying")
    setFlowError(null)
    try {
      const res = await fetch("/api/dropin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: exhaustedOffer.session.id,
          familyMemberId: child.familyMemberId,
        }),
      })
      if (myGeneration !== generationRef.current) return
      const body = await parseJson(res)
      if (!res.ok) {
        const err = body.error as { message?: string } | string | undefined
        const message =
          typeof err === "object" && err?.message
            ? err.message
            : "Could not start payment — please try again.";
        setFlowError(message)
        setPhase("allotment_exhausted")
        return
      }
      if (body.paymentRequired && typeof body.checkoutUrl === "string") {
        window.location.href = body.checkoutUrl
        return
      }
      // Free path — shouldn't normally happen for a paid make-up (the
      // endpoint always prices it > 0), but degrade to success rather than
      // stall if it ever does.
      setBookedSession(exhaustedOffer.session)
      setPhase("success")
      onBooked()
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setPhase("allotment_exhausted")
    }
  }

  function handleClose() {
    generationRef.current += 1
    onClose()
  }

  const eligibleSessions = sessions
    .filter((s) => s.id !== child.nextSession?.sessionId)
    .filter((s) => {
      const slot = slots.find((sl) => sl.templateId === s.templateId)
      return slot ? isAgeEligible(slot, childAge) : true
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
        {phase === "loading" && (
          <>
            <DialogTitle className="text-ink">Book a make-up class</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Loading available classes for {child.name}…
            </DialogDescription>
            <LoadingSkeleton variant="card" rows={2} />
          </>
        )}

        {phase === "load_error" && (
          <>
            <DialogTitle className="text-ink">Couldn't load classes</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Something went wrong fetching the schedule.
            </DialogDescription>
            <ErrorBanner message={loadError} />
            <Button type="button" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </>
        )}

        {(phase === "picking" || phase === "booking") && (
          <>
            <DialogTitle className="text-ink">Book a make-up class for {child.name}</DialogTitle>
            <DialogDescription className="text-ink-muted">
              Pick an upcoming class to make up a missed week — this draws from{" "}
              {child.name}'s monthly allotment.
            </DialogDescription>

            <ErrorBanner message={flowError} />

            <div className="relative">
              {eligibleSessions.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No upcoming make-up classes are available right now — check back soon.
                </p>
              ) : (
                <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                  {eligibleSessions.map((s) => {
                    const slot = slots.find((sl) => sl.templateId === s.templateId)
                    const full = s.spotsLeft === 0
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={full || phase === "booking"}
                        onClick={() => void attemptBook(s)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${
                          full
                            ? "border-border bg-cream-2 opacity-60 cursor-not-allowed"
                            : "border-border hover:border-ochre/50"
                        }`}
                      >
                        <div className="font-semibold text-ink text-sm">
                          {slot?.name ?? "Class"}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {formatDateTime(s.startsAt)}
                        </div>
                        {(slot?.venueName || slot?.locationName) && (
                          <div className="text-xs text-ink-muted">
                            {slot?.venueName ?? slot?.locationName}
                          </div>
                        )}
                        <div className="text-xs mt-1.5 font-medium">
                          {full ? (
                            <span className="text-destructive">Class full</span>
                          ) : (
                            <span className="text-emerald-700">{s.spotsLeft} spots left</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {phase === "booking" && (
                <div
                  className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-paper/85 text-sm font-medium text-ink-2"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="size-4 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  Booking…
                </div>
              )}
            </div>
          </>
        )}

        {phase === "waiver" && pendingSession && (
          <form onSubmit={(e) => void submitWaiver(e)} className="space-y-4">
            <DialogTitle className="text-ink">One more step: sign the guardian waiver</DialogTitle>
            <DialogDescription className="text-ink-2">
              {child.name} is booking {formatDateTime(pendingSession.startsAt)} — this covers
              every class they attend from here on.
            </DialogDescription>

            <p className="text-sm text-ink-2 leading-relaxed rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              {DROPIN_WAIVER_TEXT}
            </p>

            <div className="flex items-start gap-3">
              <Checkbox
                id="makeup-waiver-accept"
                checked={waiverAccepted}
                onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
              />
              <Label htmlFor="makeup-waiver-accept" className="text-sm leading-snug cursor-pointer">
                {waiverAssentSentence("guardian", child.name)}
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="makeup-waiver-signer-name" className="text-sm">
                Parent/guardian signature
              </Label>
              <Input
                id="makeup-waiver-signer-name"
                value={waiverSignerName}
                onChange={(e) => setWaiverSignerName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <Button
              type="submit"
              disabled={!waiverAccepted || waiverSignerName.trim().length === 0}
              className="w-full sm:w-auto"
            >
              Sign waiver & book class
            </Button>
          </form>
        )}

        {phase === "allotment_exhausted" && exhaustedOffer && (
          <>
            <DialogTitle className="text-ink">This month's classes are used up</DialogTitle>
            <DialogDescription className="text-ink-2">
              {child.name}'s monthly allotment is used up for{" "}
              {formatDateTime(exhaustedOffer.session.startsAt)}. Pay{" "}
              {fmtDollars(exhaustedOffer.memberRateCents) ?? "the class rate"} to make up this one
              class instead?
            </DialogDescription>
            <ErrorBanner message={flowError} />
            <div className="flex gap-3">
              <Button type="button" onClick={() => void payForClass()}>
                Pay for this class
              </Button>
              <Button type="button" variant="outline" onClick={() => setPhase("picking")}>
                Back
              </Button>
            </div>
          </>
        )}

        {phase === "paying" && (
          <div className="py-6 text-center space-y-2">
            <div
              className="mx-auto size-6 rounded-full border-2 border-ochre border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-ink-muted">Redirecting to payment…</p>
          </div>
        )}

        {phase === "success" && bookedSession && (
          <>
            <DialogTitle className="text-ink">You're all set!</DialogTitle>
            <DialogDescription className="text-ink-muted">
              {child.name}'s make-up class is booked for {formatDateTime(bookedSession.startsAt)}.
            </DialogDescription>
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Per-child card — membership branch
// ---------------------------------------------------------------------------

function MembershipChildCard({
  child,
  onChanged,
}: {
  child: SummaryChild
  onChanged: () => void
}) {
  const membership = child.membership!
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    const nextSession = child.nextSession
    if (!nextSession) return
    const confirmed = window.confirm(
      `Cancel ${child.name}'s class on ${formatDateTime(nextSession.startsAt)}? If this is before ` +
        "the cancellation window, the class credit will be freed — cancelling too close to class " +
        "time isn't allowed.",
    )
    if (!confirmed) return

    const bookingId = nextSession.bookingId
    setCancelling(true)
    try {
      const res = await fetch(`/api/classes/bookings/${bookingId}/cancel`, { method: "POST" })
      const body = await parseJson(res)
      if (!res.ok) {
        if (body.error === "inside_cutoff") {
          toast.error("Too close to class time to cancel — you're inside the cancellation window.")
        } else {
          toast.error(
            typeof body.message === "string" ? body.message : "Could not cancel — please try again.",
          )
        }
        return
      }
      if (body.creditFreed) {
        toast.success("Cancelled — the class credit was freed.")
      } else if (body.refunded) {
        toast.success("Cancelled — refund issued.")
      } else {
        toast.success("Cancelled.")
      }
      onChanged()
    } catch {
      toast.error("Network error — please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const badge = statusBadge(membership.status)
  const isActive = membership.status === "active"

  return (
    <>
      <DashboardCard
        type="class"
        eyebrow={membership.tierName}
        title={child.name}
        meta={allotmentLabel(membership.classAllotmentRemaining)}
        status={badge}
        action={
          <div className="flex flex-col items-end gap-1.5">
            {isActive ? (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                Book a make-up
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <a href="/dashboard/payments">Update payment</a>
              </Button>
            )}
            {child.enrollment && (
              <Button asChild size="sm" variant="outline">
                <a href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}>
                  Change home slot
                </a>
              </Button>
            )}
            {child.nextSession && (
              <Button size="sm" variant="outline" disabled={cancelling} onClick={() => void handleCancel()}>
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
        }
      >
        <div className="mt-1.5 space-y-1">
          {child.enrollment ? (
            <p className="text-xs text-ink-2">
              Home slot:{" "}
              <span className="font-medium text-ink">{child.enrollment.templateName}</span> —{" "}
              {formatDayTime(child.enrollment.weekday, child.enrollment.startTime)}
            </p>
          ) : (
            <a
              href={`/dashboard/family/choose-slot?child=${child.familyMemberId}`}
              className="inline-block text-xs font-medium text-ochre hover:underline"
            >
              Choose a home slot →
            </a>
          )}
          {child.nextSession ? (
            <p className="text-xs text-ink-2">
              Next class: {formatDateTime(child.nextSession.startsAt)}
            </p>
          ) : child.enrollment ? (
            <p className="text-xs text-ink-muted">No upcoming class scheduled yet.</p>
          ) : null}
          {membership.status === "past_due" && (
            <p className="text-xs text-amber-700">
              Update your payment method to keep classes active.
            </p>
          )}
        </div>
      </DashboardCard>

      <MakeUpModal
        child={child}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onBooked={() => {
          setModalOpen(false)
          onChanged()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Per-child card — no membership, trial used → convert CTA
// ---------------------------------------------------------------------------

function ConvertCard({
  child,
  cheapestMonthlyCents,
}: {
  child: SummaryChild
  cheapestMonthlyCents: number | null
}) {
  const priceLabel = fmtDollars(cheapestMonthlyCents)
  return (
    <DashboardCard
      type="class"
      eyebrow="Free trial"
      title={child.name}
      meta="Loved the trial?"
      action={
        <Button asChild size="sm">
          <a href="/youth/classes#pricing">
            {priceLabel ? `Join from ${priceLabel}/mo` : "See membership pricing"}
          </a>
        </Button>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Top-level island
// ---------------------------------------------------------------------------

export default function FamilyClassesCard() {
  useHydrationBeacon()

  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading")
  const [children, setChildren] = useState<SummaryChild[]>([])
  const [cheapestMonthlyCents, setCheapestMonthlyCents] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setPhase("loading")
    ;(async () => {
      try {
        const [summaryRes, tiersRes] = await Promise.all([
          fetch("/api/classes/summary"),
          fetch("/api/public/membership-tiers"),
        ])
        if (cancelled) return
        if (!summaryRes.ok) {
          setPhase("error")
          return
        }
        const summaryBody = (await summaryRes.json()) as { children: SummaryChild[] }

        // Cheapest live class-membership tier — for the convert CTA's "$X/mo"
        // figure. Best-effort: a failed/empty tiers fetch just drops the
        // figure (ConvertCard falls back to generic copy), it never blocks
        // rendering the rest of the card.
        let cheapest: number | null = null
        if (tiersRes.ok) {
          const tiersBody = (await tiersRes.json()) as { tiers: MembershipTier[] }
          const classTierPrices = tiersBody.tiers
            .filter(isClassTier)
            .map((t) => t.monthlyPriceCents)
            .filter((c): c is number => typeof c === "number")
          if (classTierPrices.length > 0) {
            cheapest = Math.min(...classTierPrices)
          }
        }

        if (cancelled) return
        setChildren(summaryBody.children)
        setCheapestMonthlyCents(cheapest)
        setPhase("ready")
      } catch {
        if (!cancelled) setPhase("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  if (phase === "loading") {
    return <LoadingSkeleton variant="card" rows={2} />
  }

  if (phase === "error") {
    return (
      <div className="space-y-2">
        <ErrorBanner message="We couldn't load your class memberships." />
        <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </Button>
      </div>
    )
  }

  const qualifying = children.filter((c) => c.membership !== null || c.trialUsed)
  if (qualifying.length === 0) return null

  return (
    <div className="space-y-3">
      {qualifying.map((c) =>
        c.membership ? (
          <MembershipChildCard
            key={c.familyMemberId}
            child={c}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <ConvertCard
            key={c.familyMemberId}
            child={c}
            cheapestMonthlyCents={cheapestMonthlyCents}
          />
        ),
      )}
    </div>
  )
}
